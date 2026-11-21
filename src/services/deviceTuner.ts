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
import { robustValue, relativeSpread, tieBand, NEEDS_THIRD_RUN, CONFIRM_BELOW_GAIN } from './tuneStats';

/** The model-memory settings a refinement changes on top of the winning backend and thread count. */
interface TuneExtra { cacheType?: CacheType; flashAttn?: boolean; nBatch?: number; gpuLayers?: number; /** The model drafts with the multi-token-prediction layers built into it (see modelManager.setEmbeddedMtp). */ mtp?: boolean }
export interface TuneOption { id: string; label: string; backend: InferenceBackend; threads: number; extra?: TuneExtra }
export interface TuneResult {
  option: TuneOption; tps: number; firstWordSec: number; error?: string;
  /** Every timing behind `tps` and `firstWordSec` (they are medians of these, outliers removed). Absent for a single older-style result. */
  samples?: number[]; firstWords?: number[];
  /** How much the repeated timings disagreed, as a share of their median. */
  spread?: number;
}

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

/**
 * Drafting with the layers built into the model, tried once for a model that has no draft file and is not marked as having them: kept only
 * if clearly faster. Only when the model file's own metadata shows MTP layers (`mtpLayers` > 0): unknown (null) and none (0) are never tried,
 * because loading drafting on a file that cannot do it measures nothing useful and a model's name says nothing about its layers.
 */
export function mtpOptions(base: TuneOption, model: { engine?: string; draftPath?: string; embeddedMtp?: boolean }, mtpLayers: number | null = null): TuneOption[] {
  if (model.engine !== 'llama' || model.draftPath || model.embeddedMtp || !mtpLayers || mtpLayers <= 0) return [];
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

/** A typical chat reply, in tokens: what "the whole reply" means when options are ranked. */
export const TYPICAL_REPLY_TOKENS = 150;

/**
 * Speed over a whole reply: tokens written divided by the time from asking to the last word (the wait for the first word plus the writing).
 * Ranking by writing speed alone prefers an accelerator that starts slowly but writes fast, which is slower for the replies people read.
 * With no first-word time recorded it is the writing speed, as before.
 */
export function wholeReplySpeed(r: { tps: number; firstWordSec: number }): number {
  if (!Number.isFinite(r.tps) || r.tps <= 0) return 0;
  return r.firstWordSec > 0 ? TYPICAL_REPLY_TOKENS / (r.firstWordSec + TYPICAL_REPLY_TOKENS / r.tps) : r.tps;
}

/** The result that finishes a typical reply soonest; when two are within the timing noise, the one with fewer threads (cooler and kinder to the battery). */
export function pickBest(results: TuneResult[]): TuneResult | null {
  const ok = results.filter((r) => !r.error && r.tps > 0);
  if (!ok.length) return null;
  const topResult = ok.reduce((a, b) => (wholeReplySpeed(b) > wholeReplySpeed(a) ? b : a));
  // Two results closer than the noise in the timings are a tie, and a tie goes to the cooler, kinder setting (fewer threads).
  const band = tieBand(topResult.spread ?? 0);
  return ok.filter((r) => wholeReplySpeed(r) >= wholeReplySpeed(topResult) * (1 - band)).sort((a, b) => a.option.threads - b.option.threads || wholeReplySpeed(b) - wholeReplySpeed(a))[0];
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

/** Results within this share of the fastest are too close to call from one timing each. */
const CLOSE_TO_TOP = 0.85;

/** The two fastest first-round results when they are within noise of each other: they are timed again before one is picked (each repeat is a full model load, so no more than the decision needs). */
export function contendersToConfirm(results: TuneResult[]): TuneResult[] {
  const ok = results.filter((r) => !r.error && r.tps > 0);
  const top = ok.reduce((m, r) => Math.max(m, r.tps), 0);
  const close = ok.filter((r) => r.tps >= top * CLOSE_TO_TOP).sort((a, b) => b.tps - a.tps).slice(0, 2);
  return close.length >= 2 ? close : [];
}

/**
 * The plain winner and the best memory-setting refinement, only when one timing would ADOPT the refinement (it beat the winner by REFINE_GAIN)
 * without being so far ahead that noise cannot explain it. A refinement that did not win on its single timing changes nothing and costs nothing.
 */
export function refinementToConfirm(first: TuneResult | null, results: TuneResult[]): TuneResult[] {
  const refined = pickBest(results.filter((r) => r.option.extra));
  const ambiguous = !!first && !!refined && refined.tps >= first.tps * REFINE_GAIN && refined.tps < first.tps * CONFIRM_BELOW_GAIN;
  return ambiguous && first && refined ? [first, refined] : [];
}

/** The batch size in use and the quickest alternative, only when one reading would adopt the alternative (REFINE_GAIN faster) by a margin noise could explain (under CONFIRM_BELOW_GAIN). */
export function batchesToConfirm(deepResults: TuneResult[]): TuneResult[] {
  const baseline = deepResults.find((r) => !r.error && r.option.id.endsWith('batch-now'));
  const quickest = deepResults.filter((r) => !r.error && !r.option.id.endsWith('batch-now') && r.firstWordSec > 0).sort((a, b) => a.firstWordSec - b.firstWordSec)[0];
  const gain = baseline && quickest ? baseline.firstWordSec / quickest.firstWordSec : 0;
  return baseline && quickest && gain >= REFINE_GAIN && gain < CONFIRM_BELOW_GAIN ? [baseline, quickest] : [];
}

/** The same result after it was timed again (matched by option), or the original. */
const refreshed = (list: TuneResult[], result: TuneResult | null): TuneResult | null => (result ? list.find((r) => r.option.id === result.option.id) ?? result : null);

/** A tiny reply that makes an accelerator compile its kernels and page the weights in, so the timed reply is not the first thing it ever ran. */
const WARM_UP_PROMPT = 'Say hello.';

/** Combines two timings of the same option into one: medians of all the samples, outliers removed. A failed timing never replaces a good one. */
export function mergeResults(a: TuneResult, b: TuneResult): TuneResult {
  if (a.error || a.tps <= 0) return b.error || b.tps <= 0 ? a : b;
  if (b.error || b.tps <= 0) return a;
  const samples = [...(a.samples ?? [a.tps]), ...(b.samples ?? [b.tps])];
  const firstWords = [...(a.firstWords ?? [a.firstWordSec]), ...(b.firstWords ?? [b.firstWordSec])].filter((v) => v > 0);
  return { option: a.option, tps: robustValue(samples), firstWordSec: firstWords.length ? robustValue(firstWords) : 0, samples, firstWords, spread: relativeSpread(samples) };
}

/** Loads the model with one option's settings (the rest as they were), writes one reply and reports how fast it went. */
async function timeOption(ctx: { modelId: string; old: TuneBase; facts?: { mtpLayers: number | null } }, option: TuneOption, run: { prompt: string; warmUp?: boolean }): Promise<TuneResult> {
  const { modelId, old } = ctx;
  const { prompt, warmUp = false } = run;
  useAppStore.getState().updateSettings({ inferenceBackend: option.backend, nThreads: option.threads, backendUserChosen: true, cacheType: old.cacheType, flashAttn: old.flashAttn, nBatch: old.nBatch, gpuLayers: old.gpuLayers, ...memoryOf(option.extra) } as any);
  // Drafting with the model's own prediction layers: set on the model for this try (the engine loads without it if the model has none).
  if (option.extra?.mtp) markMtp(modelId, true);
  try {
    // A fresh load each time: threads, acceleration and the cache are fixed when the model loads.
    await activeModelService.unloadTextModel(true);
    await activeModelService.loadTextModel(modelId);
    // What the model file itself says about MTP, read while it is loaded (a property of the file, whichever accelerator is running).
    if (ctx.facts) ctx.facts.mtpLayers = llmService.getEmbeddedMtpLayers() ?? ctx.facts.mtpLayers;
    if (warmUp) {
      try { await llmService.generateResponse([{ id: 'w', role: 'user', content: WARM_UP_PROMPT, timestamp: 0 }], { disableThinking: true }); } catch { /* a failed warm-up shows up in the timed reply */ }
    }
    await llmService.generateResponse([{ id: 'u', role: 'user', content: prompt, timestamp: 0 }], { disableThinking: true });
    const st = llmService.getPerformanceStats();
    const tps = st.lastDecodeTokensPerSecond || st.lastTokensPerSecond || 0;
    // Keep what each backend measured, apart from the others (speed.ts), so the history says which backend is faster on this phone.
    if (!option.extra && prompt === PROMPT) useSpeedStats.getState().record(modelId, { decode: tps, backend: String(option.backend) });
    const firstWordSec = (st.lastTimeToFirstToken || 0) / 1000;
    return { option, tps, firstWordSec, samples: [tps], firstWords: [firstWordSec] };
  } catch (e: any) {
    logger.warn(`[TUNE] ${option.id} failed: ${e?.message || e}`);
    return { option, tps: 0, firstWordSec: 0, error: String(e?.message || e) };
  }
}

/** Everything tried on the winner of the first round: memory settings, how many layers go to the chip, and the model's built-in MTP drafting. */
function secondRound(base: TuneOption, old: TuneBase, model: { engine?: string; draftPath?: string; embeddedMtp?: boolean; filePath?: string; fileSize?: number; mtpLayers?: number | null }): TuneOption[] {
  return [...refineOptions(base, { cacheType: old.cacheType, flashAttn: old.flashAttn }, model), ...layerOptions(base, old.gpuLayers), ...mtpOptions(base, model, model.mtpLayers ?? null)];
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
  const facts: { mtpLayers: number | null } = { mtpLayers: null };
  // An accelerator's first reply includes compiling its kernels: it gets a throw-away reply first so that cost is not held against it.
  const needsWarmUp = (option: TuneOption) => option.backend !== INFERENCE_BACKENDS.CPU;
  const runList = async (list: TuneOption[], at: { done: number; total: number; prefix?: string; prompt?: string; into?: TuneResult[] }): Promise<void> => {
    const { prompt = PROMPT, into = results } = at;
    for (const [i, option] of list.entries()) {
      if (cancelFlag) break;
      onProgress({ step: at.done + i + 1, steps: at.total, label: `${at.prefix ?? ''}${option.label}`, results: [...results, ...deepResults] });
      into.push(await timeOption({ modelId, old, facts }, option, { prompt, warmUp: needsWarmUp(option) }));
    }
  };
  /**
   * Times the given results again (a fresh load each, like the first time) and replaces each with the merged, robust result. A third timing is
   * taken only when the two disagree by more than NEEDS_THIRD_RUN. Only used for results too close to call, never for the whole list.
   */
  const confirm = async (subset: TuneResult[], at: { into: TuneResult[]; prompt: string; metric: 'tps' | 'firstWord'; prefix: string; done: number }): Promise<void> => {
    const values = (r: TuneResult) => (at.metric === 'tps' ? r.samples ?? [r.tps] : r.firstWords ?? [r.firstWordSec]);
    for (const [i, current] of subset.entries()) {
      if (cancelFlag) return;
      onProgress({ step: at.done + i + 1, steps: at.done + subset.length, label: `${at.prefix}${current.option.label}`, results: [...results, ...deepResults] });
      // Every repeat starts differently from the first reading, so a cache of the earlier prompt's text cannot make the repeat look faster.
      const again = (n: number) => timeOption({ modelId, old, facts }, current.option, { prompt: `Reading ${n + 1}. ${at.prompt}`, warmUp: needsWarmUp(current.option) });
      let merged = mergeResults(current, await again(1));
      if (!cancelFlag && values(merged).length === 2 && relativeSpread(values(merged)) > NEEDS_THIRD_RUN) merged = mergeResults(merged, await again(2));
      const at0 = at.into.indexOf(current);
      if (at0 >= 0) at.into[at0] = merged;
    }
  };
  let first: TuneResult | null = null;
  let chosen: TuneResult | null = null;
  try {
    useTuned.getState().setMemory(modelId, undefined);
    await runList(options, { done: 0, total: options.length });
    // The options within noise of the fastest are timed again before one is picked: a single reading must not decide between close ones.
    await confirm(contendersToConfirm(results), { into: results, prompt: PROMPT, metric: 'tps', prefix: 'checking again: ', done: options.length });
    first = cancelFlag ? null : pickBest(results);
    const refine = first ? secondRound(first.option, old, { ...model, mtpLayers: facts.mtpLayers }) : [];
    await runList(refine, { done: options.length, total: options.length + refine.length, prefix: 'memory: ' });
    // A refinement that is only a little better (or worse) than the plain winner might be noise: both are timed again before the choice.
    await confirm(refinementToConfirm(first, results), { into: results, prompt: PROMPT, metric: 'tps', prefix: 'checking again: ', done: options.length + refine.length });
    first = refreshed(results, first);
    // A memory-setting refinement is kept only when clearly faster than the plain winner it was built from.
    chosen = cancelFlag ? null : keepRefinement(results, first);
    undoMtpTry(modelId, model, chosen); // a lost MTP try is undone before the batch round, which must not run with it
    // The longer test: how fast a long prompt is read with other batch sizes. The winner so far is timed again on the same long prompt first.
    if (opts.deep && chosen && !cancelFlag) {
      const base = chosen.option;
      const batches = [{ ...base, id: `${base.id}+batch-now`, label: `${base.label}, batch ${old.nBatch} (as now)` }, ...batchOptions(base, old.nBatch)];
      const done = options.length + refine.length;
      await runList(batches, { done, total: done + batches.length, prefix: 'long prompt: ', prompt: LONG_PROMPT, into: deepResults });
      // A batch size that read the long prompt only a little faster could be noise: that one and the size in use are read again before the choice.
      await confirm(batchesToConfirm(deepResults), { into: deepResults, prompt: LONG_PROMPT, metric: 'firstWord', prefix: 'long prompt, again: ', done: done + batches.length });
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

