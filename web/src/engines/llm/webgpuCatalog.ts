// WebGPU models (MLC / WebLLM builds). They appear in Models next to the GGUF models: each one is offered as a
// single pseudo file "<id>.webgpu.gguf" whose download is replaced by WebLLM fetching the real weights into the
// browser cache (see downloadManager.ts) and leaving a small marker file that the engine recognises.
export interface WebGpuModel { id: string; name: string; params: number; vramMB: number; org: string; vision?: boolean; note: string }

export const WEBGPU_MODELS: WebGpuModel[] = [
  { id: 'gemma-4-E2B-it-q4f16_1-MLC', name: 'Gemma 4 E2B', params: 2, vramMB: 3387, org: 'google', note: 'Google\'s latest, thinking mode. Runs on your GPU in the browser.' },
  { id: 'Qwen3.5-0.8B-q4f16_1-MLC', name: 'Qwen 3.5 0.8B', params: 0.8, vramMB: 1629, org: 'Qwen', note: 'Ultra-light, thinking mode. Runs on your GPU.' },
  { id: 'Qwen3.5-2B-q4f16_1-MLC', name: 'Qwen 3.5 2B', params: 2, vramMB: 2245, org: 'Qwen', note: 'Hybrid thinking + chat. Runs on your GPU.' },
  { id: 'Qwen3.5-4B-q4f16_1-MLC', name: 'Qwen 3.5 4B', params: 4, vramMB: 3867, org: 'Qwen', note: 'Strong small model. Runs on your GPU.' },
  { id: 'Qwen3.5-9B-q4f16_1-MLC', name: 'Qwen 3.5 9B', params: 9, vramMB: 6433, org: 'Qwen', note: 'Large, needs a GPU with 8 GB or more.' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen 3 1.7B', params: 1.7, vramMB: 2036, org: 'Qwen', note: 'Fast thinking model. Runs on your GPU.' },
  { id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen 3 4B', params: 4, vramMB: 3431, org: 'Qwen', note: 'Good all-rounder. Runs on your GPU.' },
  { id: 'Qwen3-8B-q4f16_1-MLC', name: 'Qwen 3 8B', params: 8, vramMB: 5695, org: 'Qwen', note: 'Best quality here for 8 GB+ GPUs.' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', params: 1, vramMB: 879, org: 'meta-llama', note: 'Tiny and quick. Runs on your GPU.' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', params: 3, vramMB: 2263, org: 'meta-llama', note: 'Small, capable. Runs on your GPU.' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B', params: 8, vramMB: 5001, org: 'meta-llama', note: 'Needs a GPU with 8 GB or more.' },
  { id: 'gemma3-1b-it-q4f16_1-MLC', name: 'Gemma 3 1B', params: 1, vramMB: 711, org: 'google', note: 'Tiny Google model. Runs on your GPU.' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', params: 2, vramMB: 1895, org: 'google', note: 'Runs on your GPU.' },
  { id: 'Phi-4-mini-instruct-q4f16_1-MLC', name: 'Phi 4 mini', params: 3.8, vramMB: 3437, org: 'microsoft', note: 'Strong reasoning for its size.' },
  { id: 'Phi-3.5-vision-instruct-q4f16_1-MLC', name: 'Phi 3.5 vision', params: 4, vramMB: 4521, org: 'microsoft', vision: true, note: 'Understands pictures. Runs on your GPU.' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B', params: 1.7, vramMB: 1774, org: 'HuggingFaceTB', note: 'Small and fast.' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 Coder 1.5B', params: 1.5, vramMB: 1629, org: 'Qwen', note: 'Code help on your GPU.' },
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', name: 'DeepSeek R1 7B', params: 7, vramMB: 5106, org: 'deepseek-ai', note: 'Step-by-step reasoning. Needs 8 GB+ GPU.' },
];

/**
 * GPUs without the shader-f16 feature (many integrated GPUs, older drivers, Safari) cannot run the f16 builds. For them the
 * catalog switches to the f32 builds of the same models, using WebLLM's own list for which ones exist and what they need.
 */
export async function adaptToAdapter(): Promise<void> {
  let f16 = false;
  try { f16 = !!(await (navigator as any).gpu.requestAdapter())?.features?.has('shader-f16'); } catch { /* no adapter */ }
  if (f16) return;
  const webllm: any = await import('@mlc-ai/web-llm');
  const have = new Map<string, number>((webllm.prebuiltAppConfig?.model_list ?? []).map((m: any) => [m.model_id, m.vram_required_MB]));
  const adapted: WebGpuModel[] = [];
  for (const m of WEBGPU_MODELS) {
    const id32 = m.id.replace('-q4f16_1-MLC', '-q4f32_1-MLC');
    if (have.has(id32)) adapted.push({ ...m, id: id32, vramMB: have.get(id32) ?? m.vramMB });
  }
  WEBGPU_MODELS.splice(0, WEBGPU_MODELS.length, ...adapted);
}

export const REPO = 'mlc-ai';
export const repoIdFor = (m: WebGpuModel) => `${REPO}/${m.id}`;
export const fileNameFor = (id: string) => `${id}.webgpu.gguf`;
/** Approximate download size: the weights are a bit smaller than the GPU memory a model needs. */
export const sizeBytes = (m: WebGpuModel) => Math.round(m.vramMB * 0.7 * 1024 * 1024);
export const webgpuIdFromUrl = (url: string): string | null => {
  const m = /huggingface\.co\/mlc-ai\/([^/]+-MLC)\/resolve\/[^/]+\/[^/]+\.webgpu\.gguf/.exec(url);
  return m ? m[1] : null;
};

/** What the Models screen is told about each model (same shape as the app's own RECOMMENDED_MODELS). */
export function recommendedEntries() {
  return WEBGPU_MODELS.map((m) => ({
    id: repoIdFor(m),
    name: `${m.name} (WebGPU)`,
    params: m.params,
    description: m.note,
    minRam: Math.max(3, Math.ceil(m.vramMB / 1024) + 1),
    type: (m.vision ? 'vision' : 'text') as 'vision' | 'text',
    org: m.org,
  }));
}

/** Answers the two Hugging Face API calls the Models screen makes for these repos, without any network. */
export function installHfInterceptor() {
  const real = globalThis.fetch.bind(globalThis);
  const byRepo = new Map(WEBGPU_MODELS.map((m) => [m.id, m]));
  const filesFor = (m: WebGpuModel) => [{ type: 'file', path: fileNameFor(m.id), size: sizeBytes(m), lfs: { size: sizeBytes(m) } }];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const mt = /huggingface\.co\/api\/models\/mlc-ai\/([^/?]+-MLC)\/tree\/main/.exec(url);
    const md = /huggingface\.co\/api\/models\/mlc-ai\/([^/?]+-MLC)(?:\?|$)/.exec(url);
    const m = byRepo.get((mt ?? md)?.[1] ?? '');
    if (m) {
      const body = mt ? filesFor(m) : { id: repoIdFor(m), author: m.org, tags: ['webgpu', 'mlc'], downloads: 0, likes: 0, lastModified: '', siblings: filesFor(m).map((f) => ({ rfilename: f.path, size: f.size, lfs: f.lfs })) };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return real(input as any, init);
  }) as typeof fetch;
}
