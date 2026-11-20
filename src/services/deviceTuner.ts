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
import { useSpeedStats, useTuned, type ModelMemory } from '../atlasTools/speed';
import logger from '../utils/logger';

/** The model-memory settings a refinement changes on top of the winning backend and thread count. */
interface TuneExtra { cacheType?: CacheType; flashAttn?: boolean; nBatch?: number; gpuLayers?: number; /** The model drafts with the multi-token-prediction layers built into it (see modelManager.setEmbeddedMtp). */ mtp?: boolean }
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

/** Batch sizes worth timing against the one in use (they change how fast the prompt is read, not how fast the answer is written). */
const ACCELERATED: string[] = [INFERENCE_BACKENDS.HTP, INFERENCE_BACKENDS.OPENCL, INFERENCE_BACKENDS.VULKAN];

/**
 * How many layers go to the NPU or GPU: the winning accelerator again with fewer, more, and all of them. A model that fits on the chip
 * entirely is often much faster than one split between chip and CPU, and the other way round when the chip's memory is short. Only for
 * an accelerated winner; the layer count in use is never repeated.
 */
export function layerOptions(base: TuneOption, current: number): TuneOption[] {
  if (!ACCELERATED.includes(String(base.backend))) return [];
  const counts = [...new Set([Math.max(4, Math.round(current / 2)), Math.round(current * 1.5), 99].map((n) => Math.min(99, n)))].filter((n) => n !== current && n >= 1);
  return counts.map((n) => ({ ...base, id: `${base.id}+layers-${n}`, label: `${base.label}, ${n >= 99 ? 'all' : n} GPU layers`, extra: { ...base.extra, gpuLayers: n } }));
}

/** Drafting with the layers built into the model, tried once for a model that has no draft file and is not marked as having them: kept only if clearly faster. */
export function mtpOptions(base: TuneOption, model: { engine?: string; draftPath?: string; embeddedMtp?: boolean }): TuneOption[] {
  if (model.engine !== 'llama' || model.draftPath || model.embeddedMtp) return [];
  return [{ ...base, id: `${base.id}+mtp`, label: `${base.label}, drafting with built-in MTP`, extra: { ...base.extra, mtp: true } }];
}

/** The part of an option's extras that is saved as the model's own settings (drafting is saved on the model itself). */
const memoryOf = (extra: TuneExtra | undefined): ModelMemory => {
  const { mtp: _mtp, ...rest } = extra ?? {};
  return rest;
};

function batchOptions(base: TuneOption, current: number): TuneOption[] {
  return [256, 512, 1024].filter((n) => n !== current).map((n) => ({ ...base, id: `${base.id}+batch-${n}`, label: `${base.label}, batch ${n}`, extra: { ...base.extra, nBatch: n } }));
}

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

/** Long enough that reading it, not writing the answer, is most of the wait: it shows what a different batch size does. */
const LONG_PROMPT = `${'The river runs past the mill, the town and the old stone bridge before it reaches the sea. '.repeat(24)}Summarise the paragraph above in one sentence.`;

const PROMPT = 'Write one short paragraph (about 50 words) about rivers. No title.';

type TuneBase = { cacheType: CacheType; flashAttn: boolean; nBatch: number; gpuLayers: number };

/** Loads the model with one option's settings (the rest as they were), writes one reply and reports how fast it went. */
async function timeOption(ctx: { modelId: string; old: TuneBase }, option: TuneOption, prompt: string): Promise<TuneResult> {
  const { modelId, old } = ctx;
  useAppStore.getState().updateSettings({ inferenceBackend: option.backend, nThreads: option.threads, backendUserChosen: true, cacheType: old.cacheType, flashAttn: old.flashAttn, nBatch: old.nBatch, gpuLayers: old.gpuLayers, ...memoryOf(option.extra) } as any);
  // Drafting with the model's own prediction layers: set on the model for this try (the engine loads without it if the model has none).
  if (option.extra?.mtp) markMtp(modelId, true);
  try {
    // A fresh load each time: threads, acceleration and the cache are fixed when the model loads.
    await activeModelService.unloadTextModel(true);
    await activeModelService.loadTextModel(modelId);
    await llmService.generateResponse([{ id: 'u', role: 'user', content: prompt, timestamp: 0 }], { disableThinking: true });
    const st = llmService.getPerformanceStats();
    const tps = st.lastDecodeTokensPerSecond || st.lastTokensPerSecond || 0;
    // Keep what each backend measured, apart from the others (speed.ts), so the history says which backend is faster on this phone.
    if (!option.extra && prompt === PROMPT) useSpeedStats.getState().record(modelId, { decode: tps, backend: String(option.backend) });
    return { option, tps, firstWordSec: (st.lastTimeToFirstToken || 0) / 1000 };
  } catch (e: any) {
    logger.warn(`[TUNE] ${option.id} failed: ${e?.message || e}`);
    return { option, tps: 0, firstWordSec: 0, error: String(e?.message || e) };
  }
}

/** Everything tried on the winner of the first round: memory settings, how many layers go to the chip, and the model's built-in MTP drafting. */
function secondRound(base: TuneOption, old: TuneBase, model: { engine?: string; draftPath?: string; embeddedMtp?: boolean; filePath?: string; fileSize?: number }): TuneOption[] {
  return [...refineOptions(base, { cacheType: old.cacheType, flashAttn: old.flashAttn }, model), ...layerOptions(base, old.gpuLayers), ...mtpOptions(base, model)];
}

/** Marks (or unmarks) a model as drafting with its built-in MTP, in the app only: a try is not saved. */
function markMtp(modelId: string, on: boolean): void {
  const { downloadedModels, setDownloadedModels } = useAppStore.getState();
  if (downloadedModels.some((m) => m.id === modelId)) setDownloadedModels(downloadedModels.map((m) => (m.id === modelId && m.engine === 'llama' ? { ...m, embeddedMtp: on } : m)));
}

/** Puts the model back as it was unless the MTP try won. */
function undoMtpTry(modelId: string, model: { embeddedMtp?: boolean }, chosen: TuneResult | null): void {
  if (!chosen?.option.extra?.mtp) markMtp(modelId, !!model.embeddedMtp);
}

/** Drafting with built-in MTP is saved on the model only when it won; otherwise the model is as it was. */
async function restoreMtp(modelId: string, model: { draftPath?: string; embeddedMtp?: boolean }, best: TuneResult | null): Promise<void> {
  if (model.embeddedMtp || model.draftPath) return;
  if (best?.option.extra?.mtp) await require('./modelManager').modelManager.setEmbeddedMtp(modelId, true).catch(() => undefined);
  else markMtp(modelId, false);
}

/** The best memory-setting refinement when it is clearly faster than the plain winner it was built from, else the plain winner. */
function keepRefinement(results: TuneResult[], first: TuneResult | null): TuneResult | null {
  const refined = pickBest(results.filter((r) => r.option.extra));
  return refined && first && refined.tps >= first.tps * REFINE_GAIN ? refined : first;
}

/** The batch size that read the long prompt clearly faster than the one in use ('batch-now' is that one), else the winner unchanged. */
function keepBatch(deepResults: TuneResult[], chosen: TuneResult): TuneResult {
  const baseline = deepResults.find((r) => !r.error && r.option.id.endsWith('batch-now'));
  const quickest = deepResults.filter((r) => !r.error && !r.option.id.endsWith('batch-now') && r.firstWordSec > 0).sort((a, b) => a.firstWordSec - b.firstWordSec)[0];
  return baseline && quickest && quickest.firstWordSec * REFINE_GAIN <= baseline.firstWordSec ? { ...quickest, tps: chosen.tps } : chosen;
}

/** Runs every option on the model, then applies the fastest (or puts the old settings back if cancelled / nothing worked). */
export async function tuneDevice(modelId: string, onProgress: (p: TuneProgress) => void, opts: { deep?: boolean } = {}): Promise<TuneOutcome> {
  cancelFlag = false;
  const store = useAppStore.getState();
  const model = store.downloadedModels.find((m) => m.id === modelId);
  if (!model || model.engine !== 'llama') throw new Error('Pick a downloaded GGUF text model to tune.');
  if (llmService.isCurrentlyGenerating()) throw new Error('A chat answer is still being written. Wait for it to finish, then try again.');
  const old = { inferenceBackend: store.settings.inferenceBackend, nThreads: store.settings.nThreads, backendUserChosen: store.settings.backendUserChosen, cacheType: store.settings.cacheType, flashAttn: store.settings.flashAttn, nBatch: store.settings.nBatch, gpuLayers: store.settings.gpuLayers };
  // What an earlier test saved for this model would hide the settings being timed, so it is set aside until the new result is known.
  const earlierMemory = useTuned.getState().memory[modelId];
  const [cores, recommended] = await Promise.all([hardwareService.getCpuCoreCount(), hardwareService.getRecommendedThreadCount()]);
  const options = tuneOptions(cores, recommended, await availableAccelerators(model));
  const results: TuneResult[] = [];
  const restore = () => useAppStore.getState().updateSettings(old as any);

  const deepResults: TuneResult[] = [];
  const runList = async (list: TuneOption[], at: { done: number; total: number; prefix?: string; prompt?: string; into?: TuneResult[] }): Promise<void> => {
    const { prompt = PROMPT, into = results } = at;
    for (const [i, option] of list.entries()) {
      if (cancelFlag) break;
      onProgress({ step: at.done + i + 1, steps: at.total, label: `${at.prefix ?? ''}${option.label}`, results: [...results, ...deepResults] });
      into.push(await timeOption({ modelId, old }, option, prompt));
    }
  };
  let first: TuneResult | null = null;
  let chosen: TuneResult | null = null;
  try {
    useTuned.getState().setMemory(modelId, undefined);
    await runList(options, { done: 0, total: options.length });
    first = cancelFlag ? null : pickBest(results);
    const refine = first ? secondRound(first.option, old, model) : [];
    await runList(refine, { done: options.length, total: options.length + refine.length, prefix: 'memory: ' });
    // A memory-setting refinement is kept only when clearly faster than the plain winner it was built from.
    chosen = cancelFlag ? null : keepRefinement(results, first);
    undoMtpTry(modelId, model, chosen); // a lost MTP try is undone before the batch round, which must not run with it
    // The longer test: how fast a long prompt is read with other batch sizes. The winner so far is timed again on the same long prompt first.
    if (opts.deep && chosen && !cancelFlag) {
      const base = chosen.option;
      const batches = [{ ...base, id: `${base.id}+batch-now`, label: `${base.label}, batch ${old.nBatch} (as now)` }, ...batchOptions(base, old.nBatch)];
      const done = options.length + refine.length;
      await runList(batches, { done, total: done + batches.length, prefix: 'long prompt: ', prompt: LONG_PROMPT, into: deepResults });
      chosen = keepBatch(deepResults, chosen);
    }
  } finally {
    // Whatever happens, the settings end as the best one (below) or as they were, and an earlier saved result is not lost.
    restore();
    undoMtpTry(modelId, model, chosen);
    if (cancelFlag || !chosen) useTuned.getState().setMemory(modelId, earlierMemory);
  }
  const best = cancelFlag ? null : chosen;
  await restoreMtp(modelId, model, best);
  if (best) {
    // An NPU or GPU winner is kept as the model's preferred backend and the setting goes back to Automatic: an explicit global
    // backend would make every other model (one with pictures, one the NPU cannot run) fail to load instead of falling back.
    const accelerated = best.option.backend !== INFERENCE_BACKENDS.AUTO && best.option.backend !== INFERENCE_BACKENDS.CPU;
    useAppStore.getState().updateSettings(accelerated
      ? { inferenceBackend: INFERENCE_BACKENDS.AUTO, nThreads: best.option.threads }
      : { inferenceBackend: best.option.backend, nThreads: best.option.threads, backendUserChosen: true } as any);
    // Cache type, flash attention and batch size are kept for this model only: the other models keep the global ones.
    const kept = memoryOf(best.option.extra);
    useTuned.getState().setMemory(modelId, Object.keys(kept).length ? { ...kept, from: { cacheType: old.cacheType, flashAttn: old.flashAttn, nBatch: old.nBatch, gpuLayers: old.gpuLayers } } : undefined);
    useTuned.getState().mark(modelId, accelerated ? String(best.option.backend) : undefined);
    // The speeds measured with the other options are not how this model runs now: store the winner's.
    useSpeedStats.setState((st) => ({ byModel: { ...st.byModel, [modelId]: { ...(st.byModel[modelId] ?? { prefill: 0, outLen: 0, samples: 1 }), decode: best.tps } } }));
    // Load it the way it was just measured, so the next chat starts at the winning speed.
    try { await activeModelService.unloadTextModel(true); await activeModelService.loadTextModel(modelId); } catch { /* the chat reloads it on demand */ }
  }
  return { best, results: [...results, ...deepResults], applied: !!best, cancelled: cancelFlag };
}

