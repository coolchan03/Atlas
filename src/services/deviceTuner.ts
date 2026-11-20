/**
 * "Find the best settings for this device": loads the model a few ways (automatic acceleration, and the
 * CPU with a few thread counts), times a short reply each way, and keeps the fastest. Hand-testing on
 * the onn tablet showed the best thread count and the GPU/CPU choice differ a lot between devices
 * (CPU with 4 threads 4.5 tok/s, 8 threads 2.1, Vulkan about 2), so this measures instead of guessing.
 * The pure choices (candidates, the winner) are tested without a device.
 */
import { useAppStore } from '../stores/appStore';
import { INFERENCE_BACKENDS, type CacheType, type InferenceBackend } from '../types';
import { backendForcesF16Cache, modelForcesF16Cache } from './llmHelpers';
import { hardwareService } from './hardware';
import { llmService } from './llm';
import { activeModelService } from './activeModelService';
import { vulkanEngine } from './vulkanEngine';
import { acceleratorCandidates, type TextAccelerator } from './acceleratorSelection';
import { useSpeedStats, useTuned } from '../atlasTools/speed';
import logger from '../utils/logger';

/** The model-memory settings a refinement changes on top of the winning backend and thread count. */
interface TuneExtra { cacheType?: CacheType; flashAttn?: boolean }
export interface TuneOption { id: string; label: string; backend: InferenceBackend; threads: number; extra?: TuneExtra }
export interface TuneResult { option: TuneOption; tps: number; firstWordSec: number; error?: string }

/**
 * What to try: automatic acceleration, each NPU or GPU backend the phone offers for this model, then the CPU with the
 * recommended thread count, fewer threads and a couple more. Fewer threads often win (the slow cores drag the pool), more rarely do.
 */
const ACCELERATOR_OPTION: Record<TextAccelerator, { backend: InferenceBackend; label: string }> = {
  htp: { backend: INFERENCE_BACKENDS.HTP, label: 'NPU (Hexagon)' },
  opencl: { backend: INFERENCE_BACKENDS.OPENCL, label: 'GPU (OpenCL)' },
  vulkan: { backend: INFERENCE_BACKENDS.VULKAN, label: 'GPU (Vulkan)' },
};

export function tuneOptions(cores: number, recommended: number, accelerators: TextAccelerator[] = []): TuneOption[] {
  const rec = Math.max(1, Math.min(recommended, cores));
  const cpu = (threads: number): TuneOption => ({ id: `cpu-${threads}`, label: `CPU, ${threads} threads`, backend: INFERENCE_BACKENDS.CPU, threads });
  const counts = [...new Set([rec, Math.max(2, Math.round(rec * 0.67)), Math.min(cores, rec + 2)])].filter((n) => n >= 1 && n <= cores);
  return [
    { id: 'auto', label: 'Automatic (GPU or NPU if the phone has one)', backend: INFERENCE_BACKENDS.AUTO, threads: rec },
    // Each accelerator this phone and model can use is timed on its own, so the history says which one is fastest here.
    ...accelerators.map((a): TuneOption => ({ id: a, ...ACCELERATOR_OPTION[a], threads: rec })),
    ...counts.map(cpu),
  ];
}

/**
 * The second round: the winning backend and threads again, each with one memory setting changed (KV cache type, flash attention).
 * Only values the phone is not already using are tried, and none for a backend that forces its own (NPU and OpenCL use f16 without flash).
 */
export function refineOptions(base: TuneOption, current: { cacheType: CacheType; flashAttn: boolean }, model: { filePath?: string; fileSize?: number } = {}): TuneOption[] {
  // Automatic may pick a backend that forces f16, and Gemma 3n and 4 always run f16: timing cache types there would only measure noise.
  if (base.backend === INFERENCE_BACKENDS.AUTO || backendForcesF16Cache(base.backend) || modelForcesF16Cache(model.filePath)) return [];
  // These settings are global, and an f16 cache or no flash attention is about four times the memory of q4_0: only for a small model.
  const small = (model.fileSize ?? Infinity) <= BIG_MODEL_BYTES;
  const withExtra = (id: string, label: string, extra: TuneExtra): TuneOption => ({ ...base, id: `${base.id}+${id}`, label: `${base.label}, ${label}`, extra });
  const caches = (['f16', 'q8_0', 'q4_0'] as CacheType[]).filter((c) => c !== current.cacheType && (current.flashAttn || c === 'f16') && (small || c !== 'f16'));
  return [
    ...caches.map((c) => withExtra(`cache-${c}`, `${c} cache`, { cacheType: c })),
    current.flashAttn ? (small ? [withExtra('flash-off', 'flash attention off', { flashAttn: false, cacheType: 'f16' })] : []) : [withExtra('flash-on', 'flash attention on', { flashAttn: true })],
  ].flat();
}

/** Models above this size are not tried with an f16 cache or without flash attention (memory). */
const BIG_MODEL_BYTES = 2.5e9;

/** A refinement must beat the plain winner by this much to be kept: smaller differences are measuring noise. */
const REFINE_GAIN = 1.08;

/** The fastest result; when two are within 5%, the one with fewer threads (cooler and kinder to the battery). */
export function pickBest(results: TuneResult[]): TuneResult | null {
  const ok = results.filter((r) => !r.error && r.tps > 0);
  if (!ok.length) return null;
  const top = Math.max(...ok.map((r) => r.tps));
  return ok.filter((r) => r.tps >= top * 0.95).sort((a, b) => a.option.threads - b.option.threads || b.tps - a.tps)[0];
}

/** The NPU and GPU backends worth timing for this model on this phone (the same rule Automatic uses to choose). */
async function availableAccelerators(model: { filePath: string; mmProjPath?: string }): Promise<TextAccelerator[]> {
  try {
    const [acceleration, vulkanFound, slowGpu] = await Promise.all([hardwareService.getAccelerationCapability(), vulkanEngine.isAvailable(), vulkanEngine.isSlowTextGpu()]);
    return acceleratorCandidates({ npu: acceleration.hasNpu, opencl: acceleration.hasGpu, vulkan: vulkanFound && !slowGpu }, model.filePath, !!model.mmProjPath);
  } catch { return []; }
}

export interface TuneProgress { step: number; steps: number; label: string; results: TuneResult[] }
export interface TuneOutcome { best: TuneResult | null; results: TuneResult[]; applied: boolean; cancelled: boolean }

let cancelFlag = false;
export const cancelTuning = () => { cancelFlag = true; };

const PROMPT = 'Write one short paragraph (about 50 words) about rivers. No title.';

/** Runs every option on the model, then applies the fastest (or puts the old settings back if cancelled / nothing worked). */
export async function tuneDevice(modelId: string, onProgress: (p: TuneProgress) => void): Promise<TuneOutcome> {
  cancelFlag = false;
  const store = useAppStore.getState();
  const model = store.downloadedModels.find((m) => m.id === modelId);
  if (!model || model.engine !== 'llama') throw new Error('Pick a downloaded GGUF text model to tune.');
  if (llmService.isCurrentlyGenerating()) throw new Error('A chat answer is still being written. Wait for it to finish, then try again.');
  const old = { inferenceBackend: store.settings.inferenceBackend, nThreads: store.settings.nThreads, backendUserChosen: store.settings.backendUserChosen, cacheType: store.settings.cacheType, flashAttn: store.settings.flashAttn };
  const [cores, recommended] = await Promise.all([hardwareService.getCpuCoreCount(), hardwareService.getRecommendedThreadCount()]);
  const options = tuneOptions(cores, recommended, await availableAccelerators(model));
  const results: TuneResult[] = [];
  const restore = () => useAppStore.getState().updateSettings(old as any);

  const run = async (option: TuneOption): Promise<void> => {
    useAppStore.getState().updateSettings({ inferenceBackend: option.backend, nThreads: option.threads, backendUserChosen: true, cacheType: old.cacheType, flashAttn: old.flashAttn, ...option.extra } as any);
    try {
      // A fresh load each time: threads, acceleration and the cache are fixed when the model loads.
      await activeModelService.unloadTextModel(true);
      await activeModelService.loadTextModel(modelId);
      await llmService.generateResponse([{ id: 'u', role: 'user', content: PROMPT, timestamp: 0 }], { disableThinking: true });
      const st = llmService.getPerformanceStats();
      results.push({ option, tps: st.lastDecodeTokensPerSecond || st.lastTokensPerSecond || 0, firstWordSec: (st.lastTimeToFirstToken || 0) / 1000 });
      // Keep what each backend measured, apart from the others (speed.ts), so the history says which backend is faster on this phone.
      if (!option.extra) useSpeedStats.getState().record(modelId, { decode: st.lastDecodeTokensPerSecond || st.lastTokensPerSecond || 0, backend: String(option.backend) });
    } catch (e: any) {
      logger.warn(`[TUNE] ${option.id} failed: ${e?.message || e}`);
      results.push({ option, tps: 0, firstWordSec: 0, error: String(e?.message || e) });
    }
  };
  let first: TuneResult | null = null;
  try {
    for (const [i, option] of options.entries()) {
      if (cancelFlag) break;
      onProgress({ step: i + 1, steps: options.length, label: option.label, results: [...results] });
      await run(option);
    }
    first = cancelFlag ? null : pickBest(results);
    const refine = first ? refineOptions(first.option, { cacheType: old.cacheType, flashAttn: old.flashAttn }, model) : [];
    for (const [j, option] of refine.entries()) {
      if (cancelFlag) break;
      onProgress({ step: options.length + j + 1, steps: options.length + refine.length, label: `memory: ${option.label}`, results: [...results] });
      await run(option);
    }
  } finally {
    // Whatever happens, the settings end as the best one (below) or as they were.
    restore();
  }
  // A memory-setting refinement is kept only when clearly faster than the plain winner it was built from.
  const refined = pickBest(results.filter((r) => r.option.extra));
  const best = cancelFlag ? null : refined && first && refined.tps >= first.tps * REFINE_GAIN ? refined : first;
  if (best) {
    // An NPU or GPU winner is kept as the model's preferred backend and the setting goes back to Automatic: an explicit global
    // backend would make every other model (one with pictures, one the NPU cannot run) fail to load instead of falling back.
    const accelerated = best.option.backend !== INFERENCE_BACKENDS.AUTO && best.option.backend !== INFERENCE_BACKENDS.CPU;
    useAppStore.getState().updateSettings(accelerated
      ? { inferenceBackend: INFERENCE_BACKENDS.AUTO, nThreads: best.option.threads, ...best.option.extra }
      : { inferenceBackend: best.option.backend, nThreads: best.option.threads, backendUserChosen: true, ...best.option.extra } as any);
    useTuned.getState().mark(modelId, accelerated ? String(best.option.backend) : undefined);
    // The speeds measured with the other options are not how this model runs now: store the winner's.
    useSpeedStats.setState((st) => ({ byModel: { ...st.byModel, [modelId]: { ...(st.byModel[modelId] ?? { prefill: 0, outLen: 0, samples: 1 }), decode: best.tps } } }));
    // Load it the way it was just measured, so the next chat starts at the winning speed.
    try { await activeModelService.unloadTextModel(true); await activeModelService.loadTextModel(modelId); } catch { /* the chat reloads it on demand */ }
  }
  return { best, results, applied: !!best, cancelled: cancelFlag };
}

