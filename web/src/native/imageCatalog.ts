// The Windows app's list of downloadable image models: stable-diffusion.cpp checkpoints (GGUF) from Hugging Face,
// shown in Models > Image in place of the Android MNN / QNN packages. Each file is one entry; the app's own
// multi-file downloader fetches it into the model's folder and LocalDreamModule.loadModel prepares it on first load.
// The list is read live from Hugging Face (file names and sizes), so a re-upload there never leaves a dead entry.
interface Source { repo: string; label: string; family: 'sd15' | 'sdxl'; variant: 'base' | 'turbo'; blurb: string }
const SOURCES: Source[] = [
  { repo: 'Green-Sky/SD-Turbo-GGUF', label: 'SD-Turbo', family: 'sd15', variant: 'turbo', blurb: 'fast, 1 to 4 steps, 512 px' },
  { repo: 'second-state/stable-diffusion-v1-5-GGUF', label: 'Stable Diffusion 1.5', family: 'sd15', variant: 'base', blurb: 'the classic, 512 px' },
  { repo: 'OlegSkutte/sdxl-turbo-GGUF', label: 'SDXL-Turbo', family: 'sdxl', variant: 'turbo', blurb: 'sharper, 1 to 4 steps' },
  { repo: 'gpustack/stable-diffusion-xl-base-1.0-GGUF', label: 'SDXL 1.0', family: 'sdxl', variant: 'base', blurb: 'highest quality, 1024 px, needs 8 GB or more' },
];
const MIN_BYTES = 200 * 1024 * 1024; // smaller files are text encoders or VAEs, not checkpoints
const quantOf = (file: string) => [...file.matchAll(/(?:^|[-_.])(q\d(?:_[0-9a-z]+)*|f16|fp16|f32|bf16)(?=[-_.]|$)/gi)].map((m) => m[1].toUpperCase()).join('+');
let cache: any[] | null = null;

async function listRepo(s: Source) {
  const r = await fetch(`https://huggingface.co/api/models/${s.repo}/tree/main`);
  if (!r.ok) throw new Error(`${s.repo}: ${r.status}`);
  const files = (await r.json()) as { type: string; path: string; size: number; lfs?: { size: number } }[];
  return files
    .filter((f) => f.type === 'file' && /\.gguf$/i.test(f.path) && (f.lfs?.size ?? f.size) >= MIN_BYTES)
    .map((f) => {
      const size = f.lfs?.size ?? f.size;
      const quant = quantOf(f.path);
      const id = `sdcpp_${s.repo}_${f.path}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
      return {
        id, name: `${s.label} ${quant}`.trim(), displayName: `${s.label}${quant ? ` ${quant}` : ''}`,
        backend: 'sdcpp', fileName: f.path, size, repo: s.repo,
        downloadUrl: `https://huggingface.co/${s.repo}/resolve/main/${f.path}`,
        nativeImageFamily: s.family, nativeImageVariant: s.variant,
        description: s.blurb,
      };
    });
}

/** What Models > Image lists. Smaller files first within a model. A repo that cannot be read is skipped, never the whole list. */
export async function imageCatalog(forceRefresh = false) {
  if (cache && !forceRefresh) return cache;
  const lists = await Promise.allSettled(SOURCES.map(listRepo));
  const out = lists.flatMap((l, i) => (l.status === 'fulfilled' ? l.value.sort((a, b) => a.size - b.size) : []).map((m) => ({ ...m, order: i })));
  if (!out.length) throw new Error('Could not reach Hugging Face. Check the connection, or import a .safetensors / .gguf image model from disk.');
  cache = out;
  return out;
}

/** The banner above the list (the phone version names the chip). */
export const imageRecommendation = () => ({
  recommendedBackend: 'all' as const,
  bannerText: 'Stable Diffusion models run on your graphics card (Vulkan) or the CPU. Smaller files (Q4, Q5) need less memory; Q8 and F16 look best.',
  compatibleBackends: ['sdcpp' as const],
});
