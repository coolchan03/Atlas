import type { LlamaContext } from 'llama.rn';
import { activeAgentOverrides } from '../stores/agentStore';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { APP_CONFIG } from '../constants';
import { Message, INFERENCE_BACKENDS } from '../types';
import { MultimodalSupport, LLMPerformanceStats } from './llmTypes';
import logger from '../utils/logger';
import { templateEmitsReasoning } from '../utils/messageContent';

import { HTP_ENABLED } from '../config/featureFlags';
import { BYTES_PER_GB } from '../utils/contextLimits';
export { BYTES_PER_GB, getMaxContextForDevice } from '../utils/contextLimits';

const RESPONSE_RESERVE = 512;
const DEFAULT_THREADS = 4; // targets performance cores only; over-threading onto efficiency cores (A520) hurts
const DEFAULT_BATCH = 512;
const DEFAULT_GPU_LAYERS = Platform.OS === 'ios' ? 99 : 0;
function getOptimalThreadCount(): number { return DEFAULT_THREADS; }
function getOptimalBatchSize(): number { return DEFAULT_BATCH; }
const REPACKABLE_QUANTS = ['q4_0', 'iq4_nl'];
/** Detect repackable quant formats where disabling mmap improves inference speed. */
export function shouldDisableMmap(modelPath: string): boolean {
  if (Platform.OS !== 'android') return false;
  return REPACKABLE_QUANTS.some(q => modelPath.toLowerCase().includes(q));
}
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.codePointAt(i) ?? 0;
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) - hash) + char;
    // eslint-disable-next-line no-bitwise
    hash = hash & hash;
  }
  return hash.toString(16);
}
export async function ensureSessionCacheDir(cacheDir: string): Promise<void> {
  try {
    if (!await RNFS.exists(cacheDir)) await RNFS.mkdir(cacheDir);
  } catch (e) {
    logger.log('[LLM] Failed to create session cache dir:', e);
  }
}
export function getSessionPath(cacheDir: string, promptHash: string): string {
  return `${cacheDir}/session-${promptHash}.bin`;
}
export interface ModelLoadParams {
  baseParams: object;
  nThreads: number;
  nBatch: number;
  ctxLen: number;
  nGpuLayers: number;
  /** Whether the EFFECTIVE KV cache is f16 (OpenCL/HTP coerce to it regardless of the
   *  user setting). The single source for the memory guard's KV-size estimate — read
   *  this instead of re-deriving from settings.cacheType, which misses the coercion. */
  usesF16Cache: boolean;
}

/**
 * Backends whose native loader coerces the KV cache to f16 regardless of the user's
 * chosen cacheType: OpenCL and HTP (their llama.cpp paths don't support a quantized KV
 * cache). SINGLE source of truth — the loader, the settings display, the "settings
 * changed" diff, and the generation-details recorder must all agree via this, so the UI
 * never shows one cache type while the model ran another.
 */
export function backendForcesF16Cache(backend: string | undefined): boolean {
  return backend === INFERENCE_BACKENDS.OPENCL || (HTP_ENABLED && backend === INFERENCE_BACKENDS.HTP);
}

/** The KV cache type that will ACTUALLY be used, after backend coercion to f16. */
export function effectiveCacheType(backend: string | undefined, requested: string | undefined): string {
  return backendForcesF16Cache(backend) ? 'f16' : (requested || 'q8_0');
}

export function buildModelParams(
  modelPath: string,
  settings: { nThreads?: number; nBatch?: number; contextLength?: number; flashAttn?: boolean; enableGpu?: boolean; gpuLayers?: number; cacheType?: string; inferenceBackend?: string },
): ModelLoadParams {
  const nThreads = settings.nThreads || getOptimalThreadCount();
  const nBatch = settings.nBatch || getOptimalBatchSize();
  const ctxLen = settings.contextLength || APP_CONFIG.maxContextLength;
  // inferenceBackend takes precedence; fall back to legacy enableGpu flag
  const backend = settings.inferenceBackend;
  // Use flash_attn_type string API (replaces deprecated flash_attn boolean).
  // OpenCL and HTP backends crash with flash attn on — disable for those.
  // CPU (Android/iOS) and Metal both support it; use 'auto' to let llama.cpp decide.
  const gpuBackendIncompatible = backendForcesF16Cache(backend);
  const flash_attn_type = (settings.flashAttn === false || gpuBackendIncompatible) ? 'off' : 'auto';
  const gpuEnabled = backend ? backend !== INFERENCE_BACKENDS.CPU : settings.enableGpu !== false;
  const nGpuLayers = gpuEnabled ? (settings.gpuLayers ?? DEFAULT_GPU_LAYERS) : 0;
  const isFlashAttnEffective = flash_attn_type !== 'off';
  const requestedCache = settings.cacheType || (isFlashAttnEffective ? 'q8_0' : 'f16');
  // OpenCL init on affected Adreno devices can fail when cache_type_k/v are passed.
  // effectiveCacheType coerces OpenCL/HTP to f16 (single source shared with the UI).
  const cacheType = effectiveCacheType(backend, requestedCache);
  return {
    baseParams: {
      model: modelPath, use_mlock: false, n_batch: nBatch, n_ubatch: nBatch, n_threads: nThreads,
      use_mmap: !shouldDisableMmap(modelPath), vocab_only: false, flash_attn_type,
      // Do NOT force kv_unified — let llama.cpp pick it per architecture. Forcing
      // `true` (a marginal single-seq perf tweak) hung gemma3n (gemma-4 E2B/E4B):
      // its interleaved sliding-window + heterogeneous KV layers froze building the
      // unified KV-cache reuse map ("kv_cache: reusing layers"). The engine's
      // per-arch default (false) handles SWA models correctly and keeps GPU/Metal.
      no_extra_bufts: false,
      ...(backend === INFERENCE_BACKENDS.OPENCL ? {} : { cache_type_k: cacheType, cache_type_v: cacheType }),
    },
    nThreads, nBatch, ctxLen, nGpuLayers,
    // cacheType is already coerced to 'f16' above for OpenCL/HTP; OpenCL also omits the
    // explicit cache params and llama.cpp defaults to f16 — both are captured here.
    usesF16Cache: cacheType === 'f16',
  };
}
export { initContextWithFallback, isNativeLlamaRuntimeError } from './llmContextInit';
export type { ContextInitResult, ContextInitOptions } from './llmContextInit';

export interface GpuInfo {
  gpuEnabled: boolean;
  gpuReason: string;
  gpuDevices: string[];
  activeGpuLayers: number;
  gpuAttemptFailed: boolean;
}

export function captureGpuInfo(
  context: LlamaContext,
  gpuAttemptFailed: boolean,
  nGpuLayers: number,
): GpuInfo {
  const nativeGpuAvailable = context.gpu ?? false;
  const gpuReason = (context as any).reasonNoGPU ?? '';
  const gpuDevices = (context as any).devices ?? [];
  const activeGpuLayers = gpuAttemptFailed ? 0 : nGpuLayers;
  const gpuEnabled = nativeGpuAvailable && activeGpuLayers > 0;
  return { gpuEnabled, gpuReason, gpuDevices, activeGpuLayers, gpuAttemptFailed };
}

/**
 * UI notice for a GPU-selected load that landed on CPU (requested GPU layers, got 0 — init
 * failure/timeout, or a device/RAM refusal). Null when nothing to report. Never a silent CPU
 * downgrade (device 2026-07-13 18:57: "Backend=GPU but ran on CPU at 3.4 tok/s").
 */
export function describeGpuFallback(info: { requestedGpuLayers: number; activeGpuLayers: number; gpuAttemptFailed: boolean }): string | null {
  if (info.requestedGpuLayers <= 0 || info.activeGpuLayers > 0) return null;
  return info.gpuAttemptFailed
    ? 'GPU unavailable - its initialization failed or timed out. Running on CPU.'
    : 'GPU unavailable on this device - running on CPU.';
}
export function supportsNativeThinking(context: LlamaContext | null): boolean {
  if (!context) return false;
  try {
    // Thinking capability comes SOLELY from the model's own chat_template emitting reasoning
    // delimiters (<think>, Gemma/Qwen channels) or exposing the enable_thinking kwarg — the same
    // single-source predicate remote capability probing uses (templateEmitsReasoning). It is NEVER
    // derived from whether Jinja renders: a model with a perfectly valid Jinja template but no
    // reasoning markers (e.g. Mistral 7B, which has a tool-use template) does NOT think, yet the old
    // `isJinjaSupported() → true` short-circuit falsely surfaced the Thinking toggle for it. Covers
    // both jinja-supported and OD7 jinja-unsupported reasoning models: both carry the template here.
    const metadata = (context as any)?.model?.metadata;
    const template = metadata?.['tokenizer.chat_template'] ?? metadata?.chat_template;
    return templateEmitsReasoning(typeof template === 'string' ? template : undefined);
  } catch {
    return false;
  }
}
export function buildThinkingCompletionParams(enableThinking: boolean, isGemma4: boolean = false): { enable_thinking: boolean; reasoning_format: 'none' | 'auto' | 'deepseek' } {
  if (!enableThinking) return { enable_thinking: false, reasoning_format: 'none' };
  // Native-first (parse-once at the runtime boundary): Gemma 4 uses its own
  // <|channel>thought\n...<channel|> format, not DeepSeek's <think> tags. reasoning_format:'auto'
  // lets llama.cpp detect the model's chat_format and parse reasoning + tool calls NATIVELY —
  // populating reasoning_content/tool_calls and returning already-filtered content — instead of
  // forcing 'none' and hand-parsing the raw channel tags ourselves. Safe by construction: finalize
  // and resolveToolCalls only fall back to our hand-parser when the native fields are empty, so
  // native wins when it works and the hand-parser is a pure fallback. (Non-Gemma reasoning models
  // keep the known-good 'deepseek' path.)
  return { enable_thinking: true, reasoning_format: isGemma4 ? 'auto' : 'deepseek' };
}
/**
 * New text in an ACCUMULATED stream value (llama.rn re-parses all generated text into
 * `content` on every token) relative to what was already DISPLAYED. The parser can revise
 * displayed text: a held-back partial tag such as "<tool_call" released, trimmed
 * whitespace, or a switch from raw token pieces to parsed content after a failed partial
 * parse. Returning the whole value then re-appended the entire reply (repeated text and
 * characters, stored in the chat). Only characters beyond the displayed length are new;
 * the final reply is reconciled with the authoritative content when generation completes.
 */
export function getStreamingDelta(nextValue: string | undefined, displayed: string): string | undefined {
  if (!nextValue) return undefined;
  if (!displayed) return nextValue;
  if (nextValue.startsWith(displayed)) return nextValue.slice(displayed.length) || undefined;
  return nextValue.length > displayed.length ? nextValue.slice(displayed.length) : undefined;
}

/** Accumulated content for a stream event: parsed content, else displayed text + raw token. */
export function nextStreamedContent(
  data: { content?: string; reasoning_content?: string; token?: string }, displayed: string,
): string | undefined {
  if (data.content != null) return data.content;
  return !data.reasoning_content && data.token ? displayed + data.token : undefined;
}

/** Reads the model's trained context length from metadata, or null if unavailable. */
export function getModelMaxContext(context: LlamaContext): number | null {
  try {
    const metadata = (context as any).model?.metadata;
    if (!metadata) return null;
    // GGUF stores the trained context under an ARCHITECTURE-prefixed key (gemma4.context_length,
    // qwen3.context_length, …). Reading only the llama key returned null for gemma/qwen → 32K slider cap.
    const arch = metadata['general.architecture'];
    const trainCtx =
      (arch && metadata[`${arch}.context_length`]) ||
      metadata['llama.context_length'] || metadata['general.context_length'] || metadata.context_length;
    if (!trainCtx) return null;
    const maxModelCtx = Number.parseInt(trainCtx, 10);
    return Number.isNaN(maxModelCtx) || maxModelCtx <= 0 ? null : maxModelCtx;
  } catch {
    return null;
  }
}
export function logContextMetadata(context: LlamaContext, contextLength: number): void {
  const maxModelCtx = getModelMaxContext(context);
  if (maxModelCtx == null) return;
  logger.log(`[LLM] Model trained context: ${maxModelCtx}, using: ${contextLength}`);
  if (contextLength > maxModelCtx) logger.warn(`[LLM] Requested context (${contextLength}) exceeds model max (${maxModelCtx})`);
}
export interface MultimodalInitResult {
  initialized: boolean;
  support: MultimodalSupport;
}
export async function initMultimodal(
  context: LlamaContext,
  mmProjPath: string,
  useGpuForClip: boolean,
): Promise<MultimodalInitResult> {
  const noSupport: MultimodalInitResult = { initialized: false, support: { vision: false, audio: false } };
  try {
    const success = await context.initMultimodal({ path: mmProjPath, use_gpu: useGpuForClip });
    if (!success) {
      logger.warn('[LLM] initMultimodal returned false - mmproj may be incompatible with model');
      return noSupport;
    }
    let support: MultimodalSupport = { vision: true, audio: false };
    try {
      const s = await context.getMultimodalSupport();
      support = { vision: s?.vision || true, audio: s?.audio || false };
    } catch {
      // getMultimodalSupport not available, keep defaults
    }
    logger.log('[LLM] Multimodal initialized successfully, vision:', support.vision);
    return { initialized: true, support };
  } catch (error: any) {
    logger.error('[LLM] Multimodal init exception:', error?.message || error);
    return noSupport;
  }
}
export async function checkContextMultimodal(context: LlamaContext): Promise<MultimodalSupport> {
  try {
    // @ts-ignore - llama.rn may have this method
    if (typeof context.getMultimodalSupport === 'function') {
      const s = await context.getMultimodalSupport();
      return { vision: s?.vision || false, audio: s?.audio || false };
    }
  } catch {
    logger.log('Multimodal support check not available');
  }
  return { vision: false, audio: false };
}
export async function estimateTokens(context: LlamaContext, text: string): Promise<number> {
  try {
    return (await context.tokenize(text)).tokens?.length || 0;
  } catch {
    return Math.ceil(text.length / 4);
  }
}
export async function fitMessagesInBudget(
  context: LlamaContext,
  messages: Message[],
  budget: number,
): Promise<Message[]> {
  const result: Message[] = [];
  let remaining = budget;
  for (let i = messages.length - 1; i >= 0 && remaining > 0; i--) {
    const msg = messages[i];
    let tokens: number;
    try {
      tokens = ((await context.tokenize(msg.content)).tokens?.length || 0) + 10;
    } catch {
      tokens = Math.ceil(msg.content.length / 4) + 10;
    }
    if (tokens <= remaining) {
      result.unshift(msg);
      remaining -= tokens;
    } else if (result.length === 0) {
      result.unshift(msg);
      break;
    } else {
      break;
    }
  }
  return result;
}
// Android Adreno GPU caps for models too big to offload whole (≤4GB/≤6GB→0, ≤8GB→12, >8GB→24).
// A model whose weights fit in this share of RAM offloads fully: the caps alone meant no
// phone ever ran a model fully on the GPU, and ≤6GB phones never used it at all.
const ANDROID_FULL_OFFLOAD_RAM_SHARE = 0.4;
const ANDROID_GPU_LAYER_CAPS: { maxGB: number; layers: number }[] = [{ maxGB: 4, layers: 0 }, { maxGB: 6, layers: 0 }, { maxGB: 8, layers: 12 }];
const ANDROID_GPU_LAYERS_FALLBACK = 24;

/**
 * iOS Metal uses UNIFIED memory: offloaded weights + the compute-graph
 * (sched_reserve) buffer + KV all draw from system RAM. Full offload (99 layers)
 * of a non-trivial model on a memory-tight device overflows the Metal allocation
 * → null buffer → SIGSEGV in lm_ggml_backend_metal_buffer_type_*alloc_buffer (the
 * #1 crash). Cap the offloaded layers so the weights fit free RAM minus a reserve
 * for the compute graph + KV + the app/OS. RESERVE is the tuning knob: raise it if
 * crashes persist on a device, lower it to claw back GPU speed.
 */
const IOS_METAL_RESERVE_BYTES = 1.6 * BYTES_PER_GB;

/** Safe GPU layer count for the device + model. Skips GPU on ≤4 GB to prevent abort();
 *  caps iOS Metal offload to what fits free RAM so the buffer alloc can't overflow. */
export function getGpuLayersForDevice(
  totalMemoryBytes: number,
  requestedLayers: number,
  opts?: { modelBytes?: number; availableBytes?: number },
): number {
  const totalGB = totalMemoryBytes / BYTES_PER_GB;
  if (totalGB <= 4) return 0;

  // Android / Adreno-specific caps to prevent GPU ANRs
  if (Platform.OS === 'android') {
    if (opts?.modelBytes && opts.modelBytes <= totalMemoryBytes * ANDROID_FULL_OFFLOAD_RAM_SHARE) return requestedLayers;
    const tier = ANDROID_GPU_LAYER_CAPS.find(t => totalGB <= t.maxGB);
    const maxLayers = tier ? tier.layers : ANDROID_GPU_LAYERS_FALLBACK;
    return Math.min(requestedLayers, maxLayers);
  }

  // iOS: cap Metal offload by free RAM vs model size (see IOS_METAL_RESERVE_BYTES).
  if (Platform.OS === 'ios' && opts?.modelBytes && opts?.availableBytes) {
    const weightBudget = opts.availableBytes - IOS_METAL_RESERVE_BYTES;
    if (weightBudget <= 0) return 0; // no headroom → run on CPU rather than crash
    if (opts.modelBytes <= weightBudget) return requestedLayers; // fits → full offload
    return Math.max(0, Math.floor(requestedLayers * (weightBudget / opts.modelBytes)));
  }
  return requestedLayers;
}
export { validateModelFile, checkMemoryForModel, safeCompletion, resolveSafeContext } from './llmSafetyChecks';
const STOP_TOKENS = ['</s>', '<|end|>', '<|eot_id|>'];
export function buildCompletionParams(settings: {
  maxTokens?: number; temperature?: number; topP?: number; repeatPenalty?: number;
}, options?: { disableCtxShift?: boolean }): Record<string, any> {
  // Atlas: the active agent's own temperature / top-p / max tokens / repeat penalty win.
  settings = { ...settings, ...activeAgentOverrides() };
  return {
    n_predict: settings.maxTokens || RESPONSE_RESERVE,
    temperature: settings.temperature ?? 0.7,
    top_k: 40,
    top_p: settings.topP ?? 0.95,
    penalty_repeat: settings.repeatPenalty ?? 1.1,
    stop: STOP_TOKENS,
    ctx_shift: options?.disableCtxShift ? false : true,
  };
}
/**
 * Was a completion cut off at the n_predict cap (B15), vs finishing on EOS or being STOPPED? SINGLE
 * truncation verdict for both the plain and tool-loop paths. A user stop is `interrupted:true`
 * (stopped_eos:false) — NOT truncation; only a stopped_limit/truncated hit is (device 2026-07-14).
 */
export function isTruncatedResult(
  cr: { interrupted?: boolean; stopped_limit?: number | boolean; truncated?: boolean } | null | undefined,
): boolean {
  if (!cr || cr.interrupted === true) return false;
  return cr.stopped_limit === 1 || cr.stopped_limit === true || cr.truncated === true;
}
export function recordGenerationStats(
  startTime: number,
  firstTokenMs: number,
  tokenCount: number,
): LLMPerformanceStats {
  const elapsed = (Date.now() - startTime) / 1000;
  const tokensPerSec = elapsed > 0 ? tokenCount / elapsed : 0;
  const ttft = firstTokenMs / 1000;
  const decodeTime = elapsed - ttft;
  const decodeTokensPerSec = decodeTime > 0 && tokenCount > 1 ? (tokenCount - 1) / decodeTime : 0;
  logger.log(`[LLM] Generated ${tokenCount} tokens in ${elapsed.toFixed(1)}s (${tokensPerSec.toFixed(1)} tok/s, TTFT ${ttft.toFixed(2)}s)`);
  return {
    lastTokensPerSecond: tokensPerSec,
    lastDecodeTokensPerSecond: decodeTokensPerSec,
    lastTimeToFirstToken: ttft,
    lastGenerationTime: elapsed,
    lastTokenCount: tokenCount,
  };
}
