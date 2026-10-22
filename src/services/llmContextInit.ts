import { initLlama, type LlamaContext } from 'llama.rn';
import { Platform } from 'react-native';
import { HTP_ENABLED } from '../config/featureFlags';
import logger from '../utils/logger';
import { ensureNativeLogCapture, resetNativeLogCapture, recentNativeLog } from './llmNativeLog';

export interface ContextInitResult {
  context: LlamaContext;
  gpuAttemptFailed: boolean;
  actualLength: number;
}
/** Timeout for Adreno GPU context init on Android. 8s proved too tight on-device: Adreno 735
 *  first-load OpenCL kernel compilation exceeded it (2026-07-13 20:11 log: "timed out after
 *  8000ms" on a load that succeeded with 24 offloaded layers in an earlier session), silently
 *  downgrading every reload to CPU. The init runs on a native thread (no ANR exposure); 25s
 *  bounds a genuinely hung driver while letting a slow first compile finish (raised to 45s:
 *  first-load kernel compiles of 3-4B models still ran past 25s). */
const GPU_INIT_TIMEOUT_MS = 45000;
/** Timeout for HTP/NPU context init -- DSP firmware load plus the first weight repack take
 *  longer than Adreno; 30s cut off first NPU loads of 3-4B models. */
const HTP_INIT_TIMEOUT_MS = 90000;
/** iOS Metal init timeout. Larger than Android's because a legit large-model
 *  Metal setup takes longer — but bounded, so a Metal graph that HANGS (e.g.
 *  gemma3n froze indefinitely at kv-cache/graph construction) falls back to CPU
 *  instead of spinning the loader forever. */
const GPU_INIT_TIMEOUT_MS_IOS = 45000;
/** Race a promise against a timeout; rejects with descriptive error on expiry. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
/** Safely release a context, swallowing errors (used during fallback cleanup). */
async function safeRelease(ctx: LlamaContext | null): Promise<void> {
  if (!ctx) return;
  try { await ctx.release(); } catch (e) { logger.warn('[LLM] Error releasing context during fallback:', e); }
}
/** The bounded time a GPU/HTP context init may take before we fall back to CPU.
 *  Platform/backend only changes the DURATION (data) — the timeout policy itself
 *  is uniform. */
function gpuInitTimeoutMs(isHtp: boolean): number {
  if (isHtp) return HTP_INIT_TIMEOUT_MS;            // Android HTP/NPU
  return Platform.OS === 'ios' ? GPU_INIT_TIMEOUT_MS_IOS : GPU_INIT_TIMEOUT_MS;
}
/**
 * Race a GPU/HTP context init against a timeout so a HUNG backend (an iOS Metal
 * graph that never returns, an Android Adreno ANR) falls back to CPU instead of
 * spinning the loader forever. This applies on EVERY platform — the only
 * platform/backend difference is the timeout duration (see gpuInitTimeoutMs).
 * Previously it was gated to Android, which is exactly why a hung iOS Metal load
 * (e.g. gemma3n freezing at kv-cache/graph construction) had no escape hatch.
 */
async function tryGpuInit(promise: Promise<LlamaContext>, nGpuLayers: number, isHtp: boolean = false): Promise<LlamaContext> {
  if (nGpuLayers <= 0) return promise; // pure-CPU init — nothing to time out
  const timeoutMs = gpuInitTimeoutMs(isHtp);
  let timedOut = false;
  promise.then(ctx => { if (timedOut) safeRelease(ctx); }).catch(() => {});
  try { return await withTimeout(promise, timeoutMs, isHtp ? 'HTP context init' : 'GPU context init'); }
  catch (e) { timedOut = true; throw e; }
}

/** Errors that indicate the app's native llama runtime is unavailable, not a bad model. */
export function isNativeLlamaRuntimeError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('jsi bindings not installed') ||
    normalized.includes('failed to install jsi') ||
    normalized.includes('native module') && normalized.includes('rnllama');
}

function throwNativeLlamaRuntimeError(message: string): never {
  throw new Error(
    `Atlas's native LLM runtime is unavailable. This is an app installation/build problem, not a problem with this model.\n\nNative runtime error: ${message}`,
  );
}


export interface ContextInitOptions {
  contextLength: number;
  nGpuLayers: number;
  allowCpuFallback?: boolean;
}

function withoutDevicePin(params: object): Record<string, unknown> {
  const unpinned = { ...(params as Record<string, unknown>) };
  delete unpinned.devices;
  return unpinned;
}

async function tryGpuAfterHtp(params: object, options: ContextInitOptions): Promise<ContextInitResult | null> {
  const { contextLength, nGpuLayers } = options;
  try {
    logger.log('[LLM] Hexagon failed; attempting OpenCL GPU before CPU');
    const next = initLlama({ ...withoutDevicePin(params), n_ctx: contextLength, n_gpu_layers: nGpuLayers } as any);
    const context = await tryGpuInit(next, nGpuLayers);
    return { context, gpuAttemptFailed: !(context.gpu ?? false), actualLength: contextLength };
  } catch (openclError: any) {
    const message = openclError?.message || String(openclError);
    if (isNativeLlamaRuntimeError(message)) throwNativeLlamaRuntimeError(message);
    logger.warn(`[LLM] OpenCL retry failed; continuing to CPU: ${message}`);
    return null;
  }
}

type CpuFallbackOptions = {
  contextLength: number;
  gpuAttemptFailed: boolean;
  gpuMsg: string;
  modelPath: string;
};

function throwFinalInitError(
  errors: { gpuMsg: string; cpuMsg: string; finalMsg: string },
  details: { modelPath: string; retryContextLength: number },
): never {
  const { gpuMsg, cpuMsg, finalMsg } = errors;
  const { modelPath, retryContextLength } = details;
  logger.error(`[LLM] Attempt 3/3 failed (CPU, ctx=${retryContextLength}): ${finalMsg}`);
  logger.error(`[LLM] All 3 init attempts failed for model: ${modelPath}`);
  logger.error(`[LLM] Error chain — GPU: "${gpuMsg}" | CPU: "${cpuMsg}" | min-ctx: "${finalMsg}"`);
  const errorParts = [
    gpuMsg && gpuMsg !== finalMsg ? `GPU: ${gpuMsg}` : null,
    cpuMsg && cpuMsg !== finalMsg ? `CPU: ${cpuMsg}` : null,
    `min-ctx: ${finalMsg}`,
  ].filter(Boolean).join(' | ');
  // Surface llama.cpp's actual reason (rnllama only gives "Failed to load
  // model"); the native log says e.g. "missing tensor" / "unknown arch".
  const nativeReason = recentNativeLog();
  logger.error(`[LLM] llama.cpp native log tail:\n${nativeReason}`);
  const nativeSuffix = nativeReason ? `\n\nllama.cpp: ${nativeReason}` : '';
  throw new Error(`Failed to load model even at minimum context (${retryContextLength}). This may indicate insufficient memory, a corrupted model file, or an unsupported model format.\n\nError chain: ${errorParts}${nativeSuffix}`);
}

async function initCpuFallback(params: object, options: CpuFallbackOptions): Promise<ContextInitResult> {
  const { contextLength, gpuAttemptFailed, gpuMsg, modelPath } = options;
  try {
    logger.log(`[LLM] Attempt 2/3: CPU init (ctx=${contextLength}, gpu_layers=0)`);
    // Strip devices — HTP requires n_gpu_layers > 0; CPU fallback must not request it.
    const context = await initLlama({ ...withoutDevicePin(params), n_ctx: contextLength, n_gpu_layers: 0 } as any);
    logger.log('[LLM] CPU init succeeded');
    return { context, gpuAttemptFailed, actualLength: contextLength };
  } catch (cpuError: any) {
    const cpuMsg = cpuError?.message || String(cpuError);
    if (isNativeLlamaRuntimeError(cpuMsg)) throwNativeLlamaRuntimeError(cpuMsg);
    logger.warn(`[LLM] Attempt 2/3 failed (CPU, ctx=${contextLength}): ${cpuMsg}`);
    const retryContextLength = Math.min(contextLength, 2048);
    try {
      logger.log(`[LLM] Attempt 3/3: CPU init (ctx=${retryContextLength}, gpu_layers=0)`);
      const context = await initLlama({ ...withoutDevicePin(params), n_ctx: retryContextLength, n_gpu_layers: 0 } as any);
      logger.log(`[LLM] CPU init with ctx=${retryContextLength} succeeded`);
      return { context, gpuAttemptFailed, actualLength: retryContextLength };
    } catch (finalError: any) {
      const finalMsg = finalError?.message || String(finalError);
      if (isNativeLlamaRuntimeError(finalMsg)) throwNativeLlamaRuntimeError(finalMsg);
      throwFinalInitError({ gpuMsg, cpuMsg, finalMsg }, { modelPath, retryContextLength });
    }
  }
}

/** Init llama with GPU/HTP, fall back to CPU, then retry without increasing context. */
export async function initContextWithFallback(
  params: object,
  options: ContextInitOptions,
): Promise<ContextInitResult> {
  const { contextLength, nGpuLayers, allowCpuFallback = true } = options;
  const modelPath = (params as any).model || 'unknown';
  const isHtp = HTP_ENABLED && Array.isArray((params as any).devices) && (params as any).devices.some((d: string) => d.startsWith('HTP'));
  // Capture llama.cpp's own log so a load failure surfaces its REAL reason
  // (missing tensor / unknown architecture / wrong size) instead of rnllama's
  // opaque "Failed to load model". Reset the buffer for this attempt.
  ensureNativeLogCapture();
  resetNativeLogCapture();
  logger.log(`[LLM] initContextWithFallback: model=${modelPath}, ctx=${contextLength}, gpuLayers=${nGpuLayers}${isHtp ? ', backend=HTP' : ''}`);
  logger.log(`[WIRE-LLAMA-LOAD] ${JSON.stringify({ modelPath, contextLength, nGpuLayers, isHtp, params: { ...(params as Record<string, unknown>), model: undefined } })}`); // [WIRE] settings→native model-load config
  let gpuAttemptFailed = false;
  try {
    logger.log(`[LLM] Attempt 1/3: ${isHtp ? 'HTP' : 'GPU'} init (ctx=${contextLength}, gpu_layers=${nGpuLayers})`);
    const gpuInitPromise = initLlama({ ...params, n_ctx: contextLength, n_gpu_layers: nGpuLayers } as any);
    const context = await tryGpuInit(gpuInitPromise, nGpuLayers, isHtp);
    if (!allowCpuFallback && nGpuLayers > 0 && context.gpu !== true) {
      await safeRelease(context);
      throw new Error('Native context did not confirm GPU/NPU acceleration');
    }
    logger.log('[LLM] GPU init succeeded');
    return { context, gpuAttemptFailed, actualLength: contextLength };
  } catch (gpuError: any) {
    const gpuMsg = gpuError?.message || String(gpuError);
    if (isNativeLlamaRuntimeError(gpuMsg)) throwNativeLlamaRuntimeError(gpuMsg);
    if (!allowCpuFallback && nGpuLayers > 0) {
      throw new Error(`GPU/NPU initialization failed: ${gpuMsg}. CPU fallback is disabled.`);
    }
    if (nGpuLayers > 0) {
      logger.warn(`[LLM] Attempt 1/3 failed (GPU): ${gpuMsg}`);
      gpuAttemptFailed = true;
    } else {
      logger.warn(`[LLM] Attempt 1/3 failed (no GPU requested): ${gpuMsg}`);
    }
    // When Hexagon fails, try the bundled default GPU backend before CPU.
    // Removing the HTP device pin lets llama.rn select OpenCL when available.
    if (isHtp && nGpuLayers > 0) {
      const gpuResult = await tryGpuAfterHtp(params, { contextLength, nGpuLayers });
      if (gpuResult) return gpuResult;
    }
    return initCpuFallback(params, { contextLength, gpuAttemptFailed, gpuMsg, modelPath });
  }
}
