// LocalDreamModule for the Windows app: image generation with stable-diffusion.cpp's sd-cli as a child process.
// It mirrors the Android module's contract (the same manifest, family rules and events) so the app's image screens
// need no changes. Only the Windows shell has the engine (`atlasHost.image`); the browser build does not register it.
//   - importing and attaching files runs here, on the virtual file system (the same layout the Android module writes);
//   - checking the GPU and running the generation happen in the shell's main process (desktop/lib/sd.cjs).
import { bus, registerNativeModule } from './registry';
import { fs, norm, baseName } from '../host/fs';

interface ImageHost {
  probe(api: string): Promise<{ enumerated: boolean; backend: string; detail: string; nativeOutput: string }>;
  status(): Promise<Record<string, unknown>>;
  generate(req: Record<string, unknown>): Promise<{ id: string; imagePath: string; width: number; height: number; seed: number }>;
  cancel(): Promise<boolean>;
  onProgress(cb: (e: { step: number; totalSteps: number; progress: number; previewPath?: string }) => void): void;
}
// `available` is false when this build of the app ships without the engine: then the module is not registered at all,
// and the app says image generation is not in this build (the same as an Android build without the engine library).
const host = (): ImageHost | undefined => {
  const h = (globalThis as any).atlasHost?.image;
  return h?.available ? h : undefined;
};

const GENERATED = '/atlas/files/generated_images';
const SUPPORTED = ['sd15', 'sdxl', 'flux', 'z_image', 'anima', 'chroma'];
const KINDS = ['lora', 'vae', 'clip_l', 't5xxl', 'llm', 'upscaler', 'config'];
const dec = new TextDecoder();

/** Same rules as AtlasImageArchitecture.classify on Android. */
export function classify(fileName: string, architecture = '', tensorKeys = ''): string {
  const name = fileName.toLowerCase(), arch = architecture.toLowerCase(), keys = tensorKeys.toLowerCase();
  if (/pony[-_]v7|base-v7|auraflow/.test(name) || arch === 'auraflow') return 'auraflow';
  if (name.includes('chroma') || arch === 'chroma') return 'chroma';
  if (name.includes('anima') || arch === 'anima') return 'anima';
  if (/z[_-]?image|zimage/.test(name) || ['lumina2', 'z_image', 'z-image'].includes(arch)) return 'z_image';
  if (arch === 'flux' || (keys.includes('double_blocks.') && keys.includes('single_blocks.'))) return 'flux';
  if (['sdxl', 'stable-diffusion-xl'].includes(arch) || keys.includes('conditioner.embedders.1.') || keys.includes('text_encoder_2.') || keys.includes('clip_g.')) return 'sdxl';
  if (['sd', 'stable-diffusion'].includes(arch) || keys.includes('model.diffusion_model.') || keys.includes('diffusion_model.') || keys.includes('unet.')) return 'sd15';
  return 'unknown';
}
const variantOf = (fileName: string) => (fileName.toLowerCase().includes('turbo') ? 'turbo' : 'base');
const asPath = (uri: string) => norm(uri.replace(/^file:\/\//, ''));

async function readHead(path: string, n: number): Promise<Uint8Array> {
  const f = await fs().getFile(path);
  return new Uint8Array(await f.slice(0, n).arrayBuffer());
}

/** What a picked weight file is: a checkpoint of a family, a LoRA, or something else. Mirrors AtlasImageFiles.inspect. */
export async function inspectFile(uri: string, fileName: string): Promise<{ kind: string; family: string; expectedSize?: number }> {
  const lower = fileName.toLowerCase();
  const path = asPath(uri);
  const first = await readHead(path, 8);
  if (first.length < 8) throw new Error('File header is incomplete');
  const result: { kind: string; family: string; expectedSize?: number } = { kind: 'unknown', family: 'unknown' };
  if (lower.endsWith('.gguf')) {
    if (dec.decode(first.subarray(0, 4)) !== 'GGUF') throw new Error('Invalid GGUF header');
    // Read the general.architecture value, not any "flux" in a vocabulary, which would misclassify language GGUFs.
    const peek = await readHead(path, 262144);
    const key = new TextEncoder().encode('general.architecture');
    let at = -1;
    outer: for (let i = 0; i + key.length <= peek.length; i++) {
      for (let j = 0; j < key.length; j++) if (peek[i + j] !== key[j]) continue outer;
      at = i; break;
    }
    let arch = '';
    if (at >= 0 && at + key.length + 12 <= peek.length) {
      const pos = at + key.length;
      const dv = new DataView(peek.buffer, peek.byteOffset);
      const type = dv.getInt32(pos, true), len = Number(dv.getBigUint64(pos + 4, true));
      if (type === 8 && len >= 1 && len <= 64 && pos + 12 + len <= peek.length) arch = dec.decode(peek.subarray(pos + 12, pos + 12 + len)).toLowerCase();
    }
    const family = classify(fileName, arch);
    result.kind = family === 'auraflow' ? 'unsupported' : SUPPORTED.includes(family) ? 'image' : 'unknown';
    result.family = family;
  } else if (/\.safetensors?$/.test(lower)) {
    const length = Number(new DataView(first.buffer, first.byteOffset).getBigUint64(0, true));
    if (length <= 2 || length > 24 * 1024 * 1024) throw new Error('Invalid safetensors header size; model may be incomplete');
    const all = await readHead(path, 8 + length);
    if (all.length < 8 + length) throw new Error('Truncated safetensors header');
    const headerText = dec.decode(all.subarray(8, 8 + length));
    const json = JSON.parse(headerText) as Record<string, { data_offsets?: number[] }>;
    let last = 0;
    for (const v of Object.values(json)) if (Array.isArray(v?.data_offsets) && v.data_offsets.length === 2) last = Math.max(last, v.data_offsets[1]);
    if (last > 0) result.expectedSize = 8 + length + last;
    const header = headerText.toLowerCase();
    const lora = /lora_up|lora_down|lora_a\.weight|lora_b\.weight|lora_unet|lycoris/.test(header);
    const family = classify(fileName, '', header);
    result.kind = lora ? 'lora' : family === 'auraflow' ? 'unsupported' : SUPPORTED.includes(family) ? 'image' : 'unknown';
    result.family = family;
  } else throw new Error('Unsupported image weight extension');
  return result;
}

/** Copy with progress events, to a temp name first so a half copy never looks like a model. */
async function copyWithProgress(src: string, dest: string, maxBytes = Infinity): Promise<number> {
  const backend = fs();
  const file = await backend.getFile(src);
  if (file.size > maxBytes) throw new Error(`File is larger than the ${Math.round(maxBytes / 1048576)} MB limit`);
  const tmp = `${dest}.partial`;
  await backend.mkdir(norm(dest).replace(/\/[^/]*$/, ''));
  const w = await backend.openWriter(tmp);
  let copied = 0;
  try {
    const reader = file.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await w.write(value);
      copied += value.length;
      bus.emit('LocalDreamConvert', { stage: 'copy', fraction: file.size ? copied / file.size : 0 });
    }
    await w.close();
  } catch (e) {
    await w.close().catch(() => undefined);
    await backend.unlink(tmp).catch(() => undefined);
    throw e;
  }
  if (!copied || copied !== file.size) { await backend.unlink(tmp).catch(() => undefined); throw new Error('Model copy was incomplete'); }
  await backend.move(tmp, dest);
  return copied;
}

const manifestPath = (dir: string) => `${norm(dir)}/atlas-image.json`;
async function readManifest(dir: string) {
  const f = manifestPath(dir);
  if (!(await fs().exists(f))) throw new Error('Image support manifest not found');
  return JSON.parse(dec.decode(await fs().readFile(f)));
}
const writeManifest = (dir: string, m: unknown) => fs().writeFile(manifestPath(dir), JSON.stringify(m));

/** Reject a damaged or mislabelled checkpoint before the engine tries to load it (AtlasImageCheckpointHeader). */
async function validateCheckpoint(path: string) {
  const head = await readHead(path, 16);
  if (path.toLowerCase().endsWith('.gguf')) {
    if (head.length < 8 || dec.decode(head.subarray(0, 4)) !== 'GGUF') throw new Error('Invalid GGUF checkpoint header. Reimport the original GGUF file.');
    const version = new DataView(head.buffer, head.byteOffset).getInt32(4, true);
    if (version < 2 || version > 3) throw new Error(`Unsupported GGUF checkpoint version ${version}`);
  } else {
    const size = (await fs().getFile(path)).size;
    if (head.length < 9) throw new Error('Truncated safetensors image checkpoint');
    const length = Number(new DataView(head.buffer, head.byteOffset).getBigUint64(0, true));
    if (length < 2 || length > 16 * 1024 * 1024 || length > size - 8) throw new Error('Invalid safetensors header length. Reimport the model.');
    if (head[8] !== 0x7b) throw new Error('Invalid safetensors JSON header. Reimport the model.');
  }
}

let loaded: { dir: string; threads?: number } | null = null;
let generating = false;

if (host()) host()!.onProgress((e) => bus.emit('LocalDreamProgress', e));
if (host()) registerNativeModule('LocalDreamModule', {
  addListener() {}, removeListeners() {},
  getConstants() {
    return {
      DEFAULT_STEPS: 20, DEFAULT_GUIDANCE_SCALE: 7.5, DEFAULT_WIDTH: 512, DEFAULT_HEIGHT: 512,
      SUPPORTED_WIDTHS: [128, 192, 256, 320, 384, 448, 512], SUPPORTED_HEIGHTS: [128, 192, 256, 320, 384, 448, 512],
    };
  },
  async inspectAtlasImageFile(p: { uri: string; fileName: string }) { return inspectFile(p.uri, p.fileName); },
  async importAtlasImageFile(p: { uri: string; modelDir: string; fileName: string }) {
    const info = await inspectFile(p.uri, p.fileName);
    if (info.kind === 'lora') throw new Error('This file is a LoRA. Attach it to an image model instead of importing it as a checkpoint.');
    if (!SUPPORTED.includes(info.family)) {
      throw new Error(info.family === 'auraflow' ? 'AuraFlow / Pony V7 is not supported by this Atlas native engine yet.'
        : 'Cannot identify a supported image architecture. Atlas will not guess and render corrupt images.');
    }
    const ext = p.fileName.toLowerCase().endsWith('.gguf') ? 'gguf' : 'safetensors';
    const dir = norm(p.modelDir);
    await fs().mkdir(dir);
    const target = `${dir}/model.${ext}`;
    const size = await copyWithProgress(asPath(p.uri), target);
    if (info.expectedSize && size !== info.expectedSize) {
      await fs().unlink(target).catch(() => undefined);
      throw new Error(`Incomplete safetensors checkpoint: expected ${info.expectedSize} bytes but copied ${size}. Redownload the full file.`);
    }
    const variant = variantOf(p.fileName);
    await writeManifest(dir, { family: info.family, variant, primary: `model.${ext}`, support: [] });
    await fs().writeFile(`${dir}/_ready`, '');
    return { modelDir: dir, size, family: info.family, variant, kind: info.kind };
  },
  async attachAtlasImageSupport(p: { modelDir: string; uri: string; fileName: string; kind: string; strength?: number }) {
    if (!KINDS.includes(p.kind)) throw new Error('Unknown image support file type');
    const suffix = (p.fileName.split('.').pop() || '').toLowerCase();
    const allowed = p.kind === 'config' ? ['json'] : p.kind === 'upscaler' ? ['pth', 'pt', 'safetensors', 'gguf']
      : ['clip_l', 't5xxl', 'llm'].includes(p.kind) ? ['safetensors', 'safetensor', 'gguf'] : ['safetensors', 'safetensor'];
    if (!allowed.includes(suffix)) throw new Error(`.${suffix} is not a supported ${p.kind} file type`);
    const dir = norm(p.modelDir);
    const manifest = await readManifest(dir).catch(() => { throw new Error('Support files require a directly imported image model'); });
    const cleaned = p.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Invalid filename');
    const supportDir = `${dir}/support/${p.kind}`;
    await fs().mkdir(supportDir);
    const dest = `${supportDir}/${p.kind === 'config' ? `${crypto.randomUUID()}_${cleaned}` : cleaned}`;
    const size = await copyWithProgress(asPath(p.uri), dest, p.kind === 'config' ? 32 * 1024 * 1024 : Infinity);
    if (p.kind === 'config' && cleaned.toLowerCase() === 'atlas-runtime.json') {
      try { validateRuntimeConfig(JSON.parse(dec.decode(await fs().readFile(dest)))); } catch (e: any) {
        await fs().unlink(dest).catch(() => undefined);
        throw new Error(`Invalid JSON configuration: ${e?.message || 'parse error'}`);
      }
    }
    const strength = p.strength ?? 0.75;
    const keep: any[] = [];
    for (const item of manifest.support as any[]) {
      const replaces = item.kind === p.kind && (p.kind !== 'lora' && p.kind !== 'config' || item.name === cleaned);
      if (replaces) { if (item.path !== dest && String(item.path).startsWith(`${supportDir}/`)) await fs().unlink(item.path).catch(() => undefined); } else keep.push(item);
    }
    keep.push({ kind: p.kind, name: cleaned, path: dest, strength, enabled: true });
    await writeManifest(dir, { ...manifest, support: keep });
    return { kind: p.kind, name: cleaned, path: dest, size, strength, enabled: true };
  },
  async modifyAtlasImageSupport(p: { modelDir: string; kind: string; name: string; delete?: boolean; enabled: boolean; strength: number }) {
    const dir = norm(p.modelDir);
    const manifest = await readManifest(dir);
    const next: any[] = [];
    let matched = false;
    for (const item of manifest.support as any[]) {
      if (item.kind === p.kind && item.name === p.name) {
        matched = true;
        if (!String(item.path).startsWith(`${dir}/support/`)) throw new Error('Support path outside image library');
        if (p.delete) { await fs().unlink(item.path).catch(() => undefined); continue; }
        item.enabled = p.enabled;
        item.strength = Math.max(-2, Math.min(2, p.strength));
      }
      next.push(item);
    }
    if (!matched) throw new Error('Support file not found');
    manifest.support = next;
    await writeManifest(dir, manifest);
    return manifest;
  },

  async loadModel(p: { modelPath: string; threads?: number }) {
    if (!p.modelPath) throw new Error('modelPath is required');
    const dir = norm(p.modelPath);
    if (!(await fs().exists(manifestPath(dir)))) throw new Error('Directly imported image model manifest is missing');
    const m = await readManifest(dir);
    await validateCheckpoint(`${dir}/${m.primary}`);
    loaded = { dir, threads: p.threads };
    return true;
  },
  async unloadModel() { loaded = null; return true; },
  async isModelLoaded() { return !!loaded; },
  async getLoadedModelPath() { return loaded?.dir ?? null; },
  async getLoadedBackend() { return loaded ? 'sdcpp' : null; },
  async isGenerating() { return generating; },

  async getAtlasImageGpuDiagnostics() { return gpuDiagnostics('vulkan'); },
  async getAtlasImageGpuDiagnosticsFor(api: string) { return gpuDiagnostics(api); },
  async getAtlasImageRuntimeStatus() { return host()!.status(); },
  async hasOpenCLCache() { return true; },
  async clearOpenCLCache() { return 0; },
  async getSoCModel() { return ''; },

  async generateImage(params: Record<string, any>) {
    const h = host()!;
    if (!loaded) throw new Error('No directly imported image model is loaded');
    if (generating) throw new Error('Image generation already in progress');
    generating = true;
    try {
      await fs().mkdir(GENERATED);
      return await h.generate({ modelDir: loaded.dir, outputDir: GENERATED, params });
    } finally { generating = false; }
  },
  async cancelGeneration() { return host()!.cancel(); },

  async getGeneratedImages() {
    const backend = fs();
    if (!(await backend.exists(GENERATED))) return [];
    const out: any[] = [];
    for (const e of await backend.readdir(GENERATED)) {
      if (!e.isFile || !e.name.endsWith('.png')) continue;
      out.push({ id: e.name.replace(/\.png$/, ''), imagePath: `${GENERATED}/${e.name}`, size: e.size, createdAt: String(e.mtime) });
    }
    return out;
  },
  async deleteGeneratedImage(id: string) {
    const p = `${GENERATED}/${baseName(id)}.png`;
    if (!(await fs().exists(p))) throw new Error(`Image not found: ${id}`);
    await fs().unlink(p);
    return true;
  },
});

async function gpuDiagnostics(api: string) {
  if (api === 'opencl') return { enumerated: false, androidVulkanFeature: false, api, backend: 'GPUOpenCL (unverified)', detail: 'The Windows app uses Vulkan, not OpenCL', nativeOutput: '' };
  const r = await host()!.probe('vulkan');
  return { androidVulkanFeature: false, api, ...r };
}

/** The same small allowlist as AtlasNativeImageConfig: only a sampler and a schedule can be set from a config file. */
function validateRuntimeConfig(json: any) {
  const samplers = ['euler', 'euler_a', 'heun', 'dpm2', 'dpm++2s_a', 'dpm++2m', 'dpm++2mv2', 'lcm'];
  const schedules = ['discrete', 'karras', 'ays'];
  if (json?.schema !== 'atlas-native-image/v1') throw new Error('atlas-runtime.json requires schema "atlas-native-image/v1"');
  for (const k of Object.keys(json)) if (!['schema', 'sampling_method', 'schedule'].includes(k)) throw new Error(`atlas-runtime.json contains unsupported field '${k}'. Only sampling_method and schedule are available in this native engine.`);
  if ('sampling_method' in json && !samplers.includes(json.sampling_method)) throw new Error(`Unsupported native sampling_method '${json.sampling_method}'; choose one of ${[...samplers].sort().join(', ')}`);
  if ('schedule' in json && !schedules.includes(json.schedule)) throw new Error(`Unsupported native schedule '${json.schedule}'; choose discrete, karras or ays.`);
  if (!('sampling_method' in json) && !('schedule' in json)) throw new Error('atlas-runtime.json must contain sampling_method or schedule.');
}
