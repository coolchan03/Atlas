'use strict';
// Runs stable-diffusion.cpp's sd-cli as a child process to make one image at a time. The renderer side is
// web/src/native/localdream.ts (the app's LocalDreamModule contract); this file only starts the engine, reads its
// progress and returns the PNG. Builds are tried best first: Vulkan (any GPU), then CPU. The argument rules follow
// the Android module (AtlasNativeDiffusion.kt) so a model behaves the same on both.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let resourcesDir = '';
let real = (p) => p; // virtual path -> real path (diskfs.real)
let virtual = (p) => p; // real path -> virtual path (diskfs.virtualFor)
let progressSink = () => {};
let capsCache = null;
let running = null;
let cancelled = false;
let status = { running: false, stage: 'Idle', computeBackend: 'not selected', step: 0, totalSteps: 0, startedAt: 0, lastStepAt: 0, lastOutputAt: 0 };

function init(dir, opts) {
  resourcesDir = dir;
  real = opts.real;
  virtual = opts.virtual;
  progressSink = opts.onProgress || (() => {});
}

const EXE_NAMES = process.platform === 'win32' ? ['sd-cli.exe', 'sd.exe'] : ['sd-cli', 'sd'];
const variantDir = (v) => path.join(resourcesDir, v);
function exeFor(v) {
  for (const n of EXE_NAMES) { const p = path.join(variantDir(v), n); if (fs.existsSync(p)) return p; }
  return null;
}

/** Which builds ship with the app. Cheap: no process is started. */
function available() { return ['vulkan', 'cpu'].some(exeFor); }
function capabilities() {
  if (!capsCache) capsCache = { available: available(), variants: ['vulkan', 'cpu'].filter(exeFor) };
  return capsCache;
}

/** "name<TAB>description" per device, as `sd-cli --list-devices` prints them. Vulkan devices are named vulkan0, vulkan1 ... */
function parseDevices(output) {
  const out = [];
  for (const line of String(output).split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const name = line.slice(0, tab).trim();
    if (/^vulkan\d+$/i.test(name)) out.push({ name: name.toLowerCase(), description: line.slice(tab + 1).trim().slice(0, 160) });
  }
  return out;
}
function summarize(output, code, timedOut) {
  const cleaned = String(output).replace(/\x1b\[[0-9;]*m/g, '').replace(/[\r\n\t]+/g, ' | ').trim().slice(-650);
  const state = timedOut ? 'probe timed out' : code !== 0 ? `probe exit ${code}` : 'probe completed';
  return cleaned ? `${state}; ${cleaned}` : `${state}; no device details`;
}

let vulkanDevice = null;
/** Does the Vulkan build see a GPU? Asked before every GPU run: an earlier answer is not proof the driver still works. */
function probe(api) {
  const exe = api === 'vulkan' ? exeFor('vulkan') : null;
  if (!exe) {
    return { enumerated: false, backend: `${api} (unverified)`, detail: api === 'vulkan' ? 'The Vulkan image engine is not in this build' : 'The Windows app uses Vulkan', nativeOutput: '' };
  }
  const r = spawnSync(exe, ['--list-devices'], { encoding: 'utf8', timeout: 30000, windowsHide: true, cwd: path.dirname(exe) });
  const output = `${r.stdout || ''}\n${r.stderr || ''}`;
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  const nativeOutput = summarize(output, r.status ?? -1, !!timedOut);
  const dev = r.status === 0 ? parseDevices(output)[0] : null;
  vulkanDevice = dev ? dev.name : null;
  return dev
    ? { enumerated: true, backend: dev.name, detail: `Vulkan ${dev.name}: ${dev.description}`, nativeOutput }
    : { enumerated: false, backend: 'vulkan0 (unverified)', detail: `Native Vulkan probe inconclusive. ${nativeOutput.slice(-360)}`, nativeOutput };
}

// ---- reading sd-cli's output ----------------------------------------------------------------------
/** The step n of the requested total, from a progress bar such as "|=====>   | 3/8 - 1.20s/it". */
function parseStep(line, expected) {
  const re = /(?<![\d/])(\d{1,3})\s*\/\s*(\d{1,3})(?!\d)/g;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const step = Number(m[1]), total = Number(m[2]);
    if (total === expected && step >= 1 && step <= expected) return step;
  }
  return null;
}
function stageOf(line) {
  const l = line.toLowerCase();
  if (l.includes('decod') && (l.includes('vae') || l.includes('latent'))) return 'Decoding image';
  if (l.includes('saving') || l.includes('wrote image')) return 'Writing PNG';
  if (l.includes('sampling') || l.includes('denois')) return 'Running diffusion';
  if (l.includes('prompt') && (l.includes('encod') || l.includes('condition'))) return 'Encoding prompt';
  if (l.includes('loading') && (l.includes('tensor') || l.includes('weight') || l.includes('model'))) return 'Loading checkpoint weights';
  if (l.includes('compute buffer') || l.includes('flash attention')) return 'Preparing computation';
  return null;
}
/** Bound a run that stopped making progress without killing a slow step that is still writing output. */
function isStalled(now, started, lastStep, gpu, lastOutput) {
  const lastProgress = lastStep > started ? lastStep : started;
  const base = (gpu ? 10 : 30) * 60000;
  if (now - lastProgress < base) return false;
  const recent = lastOutput >= lastProgress && now - lastOutput < 60000;
  return !recent || now - lastProgress >= base + 20 * 60000;
}

// ---- rules shared with the Android module -------------------------------------------------------------
const SUPPORTED = ['sd15', 'sdxl', 'flux', 'z_image', 'anima', 'chroma'];
const REQUIRED = { flux: ['vae', 'clip_l', 't5xxl'], z_image: ['vae', 'llm'], anima: ['vae', 'llm'], chroma: ['vae', 't5xxl'] };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const cfgFor = (family, variant, requested) =>
  family === 'flux' || (variant === 'turbo' && ['z_image', 'anima'].includes(family)) ? 1.0 : clamp(requested, 1.0, 15.0);
const SAMPLERS = ['euler', 'euler_a', 'heun', 'dpm2', 'dpm++2s_a', 'dpm++2m', 'dpm++2mv2', 'lcm'];
const SCHEDULES = ['discrete', 'karras', 'ays'];

/** BF16 weights are converted to F16 while loading on the GPU (the file is not rewritten): some Vulkan drivers cannot compile BF16 shaders. */
function needsF16Override(weights) {
  if (!/\.safetensors?$/i.test(weights)) return false;
  try {
    const fd = fs.openSync(weights, 'r');
    try {
      const head = Buffer.alloc(8);
      if (fs.readSync(fd, head, 0, 8, 0) < 8) return false;
      const len = Number(head.readBigUInt64LE(0));
      if (len <= 0 || len > 8 * 1024 * 1024) return false;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, 8);
      return /"dtype"\s*:\s*"BF16"/.test(buf.toString('utf8'));
    } finally { fs.closeSync(fd); }
  } catch { return false; }
}

function readRuntimeConfig(dir, support) {
  let result = null;
  for (const item of support || []) {
    if (item.kind !== 'config' || item.enabled === false || String(item.name).toLowerCase() !== 'atlas-runtime.json') continue;
    if (result) throw new Error('Only one enabled atlas-runtime.json can be attached.');
    const file = real(item.path);
    if (!path.resolve(file).startsWith(path.resolve(dir, 'support') + path.sep) || !fs.statSync(file).isFile()) throw new Error('Missing or unsafe atlas-runtime.json attachment.');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (json.schema !== 'atlas-native-image/v1') throw new Error('atlas-runtime.json requires schema "atlas-native-image/v1"');
    if (json.sampling_method && !SAMPLERS.includes(json.sampling_method)) throw new Error(`Unsupported native sampling_method '${json.sampling_method}'`);
    if (json.schedule && !SCHEDULES.includes(json.schedule)) throw new Error(`Unsupported native schedule '${json.schedule}'`);
    result = { samplingMethod: json.sampling_method || null, schedule: json.schedule || null };
  }
  return result;
}

/** The command line for one generation. Pure: exported for tests. */
function buildArgs(o) {
  const { family, variant, primary, attachments, loras, loraDir, params, output, previewPattern, runtime, gpu, device, f16 } = o;
  const a = [];
  a.push(['flux', 'z_image', 'anima', 'chroma'].includes(family) ? '--diffusion-model' : '-m', primary);
  for (const [kind, flag] of [['vae', '--vae'], ['clip_l', '--clip_l'], ['t5xxl', '--t5xxl'], ['llm', '--llm']]) if (attachments[kind]) a.push(flag, attachments[kind]);
  if (loras.length) a.push('--lora-model-dir', loraDir);
  if (f16) a.push('--type', 'f16');
  // Quantized transformer on the GPU; text encoders and VAE stay on the CPU to keep transient GPU allocations small.
  if (gpu) a.push('--backend', `diffusion=${device},te=cpu,vae=cpu`, '--auto-fit', 'on');
  else a.push('--backend', 'cpu');
  const width = clamp(params.width ?? 512, 256, 1024), height = clamp(params.height ?? 512, 256, 1024);
  const steps = clamp(params.steps ?? 20, 1, 60);
  const seed = Math.trunc(params.seed ?? 42);
  const scale = params.guidanceScale ?? 7.0;
  a.push('-p', o.prompt, '-o', output, '-W', String(width), '-H', String(height), '--steps', String(steps), '-s', String(seed),
    '--cfg-scale', String(cfgFor(family, variant, scale)), '--vae-tiling', '--clip-on-cpu');
  a.push('--threads', String(clamp(params.threads ?? 4, 1, 16)), '--log-level', 'verbose');
  if (runtime?.schedule === 'ays' && !['sd15', 'sdxl'].includes(family)) {
    throw new Error('The "ays" schedule only works with SD 1.x and SDXL models. Use discrete or karras in atlas-runtime.json for this model.');
  }
  const method = runtime?.samplingMethod || (['z_image', 'anima', 'chroma'].includes(family) ? 'euler' : null);
  if (method) a.push('--sampling-method', method);
  if (runtime?.schedule) a.push('--scheduler', runtime.schedule);
  if (['z_image', 'anima', 'chroma'].includes(family)) { a.push('--diffusion-fa'); if (!gpu) a.push('--offload-to-cpu'); }
  if (family === 'chroma') a.push('--model-args', 'chroma_use_dit_mask=false');
  a.push('--preview', 'proj', '--preview-interval', String(clamp(params.previewInterval ?? 2, 1, 10)), '--preview-path', previewPattern);
  if (params.negativePrompt && family !== 'flux') a.push('-n', params.negativePrompt);
  return a;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGKILL');
  } catch { /* gone */ }
}

function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    if (b.toString('latin1', 1, 4) !== 'PNG') return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } finally { fs.closeSync(fd); }
}

function newestPreview(dir) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().reverse();
    for (const f of files) {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      if (st.size > 0 && now - st.mtimeMs > 300) return full; // a file written a moment ago may still be open
    }
  } catch { /* none yet */ }
  return null;
}

/**
 * Makes one image. req: { modelDir, outputDir, params } with virtual paths; params follow the app's native image parameters.
 * Resolves { id, imagePath (virtual), width, height, seed }. Rejects with the engine's own message when it fails.
 */
async function generate(req) {
  if (running) throw new Error('Image generation already in progress');
  cancelled = false; // a cancel made while idle, or left from the last run, must not stop this one
  const { params = {} } = req;
  const dir = path.resolve(real(req.modelDir));
  const manifestFile = path.join(dir, 'atlas-image.json');
  if (!fs.existsSync(manifestFile)) throw new Error('Not a directly imported image model');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const primary = path.resolve(dir, manifest.primary);
  if (path.dirname(primary) !== dir || !fs.existsSync(primary)) throw new Error('Image weights are missing');
  const family = manifest.family || 'unknown';
  if (!SUPPORTED.includes(family)) throw new Error(`Unsupported image architecture: ${family}. Import a supported checkpoint.`);
  const prompt = String(params.prompt || '').trim();
  if (!prompt) throw new Error('A prompt is required');

  const requested = params.computeBackend || (params.useOpenCL === false ? 'cpu' : 'vulkan');
  const wantGpu = requested !== 'cpu';
  let variant = 'cpu', device = null, deviceLabel = 'GPU disabled in settings';
  if (wantGpu) {
    status = { ...status, running: true, stage: 'Checking Vulkan GPU', computeBackend: 'Vulkan GPU requested (unverified)' };
    const p = probe('vulkan');
    if (cancelled) throw new Error('Generation cancelled');
    if (!p.enumerated) throw new Error(`No usable Vulkan diffusion GPU was detected by the native image engine. Device probe: ${p.detail.slice(-380)}.`);
    variant = 'vulkan'; device = vulkanDevice; deviceLabel = p.detail;
  }
  const exe = exeFor(variant);
  if (!exe) throw new Error(variant === 'cpu' ? 'The image engine is missing from this build of Atlas.' : 'The Vulkan image engine is missing from this build of Atlas.');

  // Attachments (VAE, text encoders, LoRAs) come from the manifest; paths inside it are virtual.
  const attachments = {}, loras = [];
  const supportRoot = path.join(dir, 'support');
  for (const item of manifest.support || []) {
    if (item.enabled === false) continue;
    const file = path.resolve(real(item.path));
    if (!file.startsWith(supportRoot + path.sep) || !fs.existsSync(file)) throw new Error(`Missing or unsafe attached ${item.kind} file`);
    if (item.kind === 'lora') {
      if (params.skipLoRA) continue;
      const name = path.basename(file, path.extname(file));
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Unsafe LoRA filename');
      loras.push({ name, strength: clamp(Number(item.strength ?? 0.75), -2, 2) });
    } else attachments[item.kind] = file;
  }
  const missing = (REQUIRED[family] || []).filter((k) => !attachments[k]);
  if (missing.length) throw new Error(`${family.toUpperCase()} is missing required components: ${missing.join(', ')}. Attach them in My models before generating.`);
  const runtime = readRuntimeConfig(dir, manifest.support);

  const id = crypto.randomUUID();
  const outDir = real(req.outputDir);
  fs.mkdirSync(outDir, { recursive: true });
  const output = path.join(outDir, `${id}.png`);
  const previewDir = real('/atlas/cache/image-preview');
  fs.rmSync(previewDir, { recursive: true, force: true });
  fs.mkdirSync(previewDir, { recursive: true });
  const steps = clamp(params.steps ?? 20, 1, 60);
  const seed = Math.trunc(params.seed ?? 42);
  let promptText = prompt;
  for (const l of loras) promptText += `<lora:${l.name}:${l.strength}>`;
  const args = buildArgs({
    family, variant: manifest.variant || 'base', primary, attachments, loras, loraDir: path.join(supportRoot, 'lora'),
    params: { ...params, steps, seed }, prompt: promptText, output, previewPattern: path.join(previewDir, 'step_%04d.png'),
    runtime, gpu: wantGpu, device, f16: wantGpu && needsF16Override(primary),
  });

  const startedAt = Date.now();
  status = { running: true, stage: `Starting ${wantGpu ? 'Vulkan' : 'CPU'}`, computeBackend: wantGpu ? 'Vulkan' : 'CPU', deviceLabel, step: 0, totalSteps: steps, startedAt, lastStepAt: 0, lastOutputAt: startedAt };
  const child = spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  running = child;
  const tail = [];
  let stalled = false, shaderFailed = false, reported = 0;
  const watchdog = setInterval(() => {
    if (child.exitCode === null && isStalled(Date.now(), startedAt, status.lastStepAt, wantGpu, status.lastOutputAt)) {
      stalled = true; status.stage = 'No diffusion step progress; native engine timed out'; killTree(child);
    }
  }, 4000);
  // sd-cli draws its progress bar with carriage returns, so frames end at \r as well as \n.
  const feed = (chunk) => {
    for (const frame of chunk.toString().split(/[\r\n]+/)) {
      if (!frame) continue;
      status.lastOutputAt = Date.now();
      tail.push(frame.slice(0, 300)); if (tail.length > 15) tail.shift();
      if (wantGpu && /compute pipeline creation failed|createComputePipeline ErrorUnknown/i.test(frame)) { shaderFailed = true; status.stage = 'Vulkan shader compilation failed'; killTree(child); }
      const stage = stageOf(frame); if (stage) status.stage = stage;
      const step = parseStep(frame, steps);
      if (step && step > reported) {
        reported = step; status.step = step; status.lastStepAt = status.lastOutputAt; status.stage = 'Running diffusion';
        const prev = newestPreview(previewDir);
        progressSink({ step, totalSteps: steps, progress: step / steps, ...(prev ? { previewPath: virtual(prev) } : {}) });
      }
    }
  };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  try {
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    if (cancelled) throw new Error('Generation cancelled');
    if (shaderFailed) throw new Error(`The Vulkan driver rejected a diffusion compute pipeline. Device: ${deviceLabel.slice(-250)}. Native log: ${tail.join(' | ').slice(-600)}`);
    if (stalled) throw new Error(`Image generation stopped without a completed diffusion step on ${wantGpu ? 'the requested Vulkan GPU' : 'the CPU'}. Try a smaller quantized checkpoint or resolution.`);
    if (code !== 0 || !fs.existsSync(output) || fs.statSync(output).size === 0) {
      fs.rmSync(output, { force: true });
      const hint = wantGpu ? `Vulkan backend could not generate an image. Device probe: ${deviceLabel.slice(-380)}. ` : 'CPU image generation failed. ';
      throw new Error(`${hint}Native engine exit ${code}: ${tail.join(' | ').slice(-900)}`);
    }
    const size = pngSize(output);
    if (!size || !size.width || !size.height) { fs.rmSync(output, { force: true }); throw new Error('Native image engine produced an invalid or undecodable image'); }
    status.stage = 'Finished';
    return { id, imagePath: virtual(output), width: size.width, height: size.height, seed };
  } catch (e) {
    fs.rmSync(output, { force: true });
    if (!/cancel/i.test(String(e && e.message))) status.stage = 'Failed';
    throw e;
  } finally {
    clearInterval(watchdog);
    if (running === child) running = null;
    status.running = false;
    killTree(child);
  }
}

function cancel() { cancelled = true; killTree(running); return true; }
function getStatus() {
  const now = Date.now();
  return {
    running: !!running, stage: status.stage, computeBackend: status.computeBackend, weightPrecision: 'checkpoint precision', deviceLabel: status.deviceLabel || '',
    probeOutput: '', androidVulkanFeature: false, step: status.step, totalSteps: status.totalSteps,
    elapsedSeconds: status.startedAt ? (now - status.startedAt) / 1000 : 0,
    secondsSinceStep: status.lastStepAt ? (now - status.lastStepAt) / 1000 : -1,
    secondsSinceLog: status.lastOutputAt ? (now - status.lastOutputAt) / 1000 : -1, cpuTicks: -1,
  };
}
function stopAll() { cancel(); }

module.exports = { init, available, capabilities, probe, generate, cancel, status: getStatus, stopAll, parseStep, parseDevices, buildArgs, isStalled };
