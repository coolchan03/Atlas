import type { LlamaContext } from 'llama.rn';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { APP_CONFIG } from '../constants';
import { INFERENCE_BACKENDS, type InferenceBackend } from '../types';
import { useAppStore } from '../stores/appStore';
import { isOverridableMemoryError } from '../utils/modelLoadErrors';
import logger from '../utils/logger';
import { hardwareService } from './hardware';
import { vulkanEngine, describeVulkanStatus } from './vulkanEngine';
import { acceleratorCandidates, requireGpuLayers } from './acceleratorSelection';
import { modelLayerTotal, effectiveOffloadedLayers } from './gpuOffload';
import { effectiveAvailableMB } from './memoryBudget';
import { modelResidencyManager } from './modelResidency';
import type { MultimodalSupport } from './llmTypes';
import {
  buildModelParams, checkMemoryForModel, resolveSafeContext, validateModelFile,
  getMaxContextForDevice, getGpuLayersForDevice, BYTES_PER_GB, initContextWithFallback,
  getModelMaxContext, captureGpuInfo, logContextMetadata, checkContextMultimodal,
  initMultimodal, supportsNativeThinking, type ModelLoadParams, type ContextInitResult,
} from './llmHelpers';

type ModelLoadRequest = {
  modelPath: string; mmProjPath?: string; override?: boolean; requestedBackend: InferenceBackend;
};
type NativeInitParams = { baseParams: object; ctxLen: number; nGpuLayers: number; fileSize: number };
type LoadHooks = {
  onFileValidated: () => void;
  onPrepared: (params: ModelLoadParams) => void;
  getCurrentContextLength: () => number | undefined;
  onFailed: (backend: InferenceBackend, message: string) => void;
  onExhausted: (failures: string[]) => void;
  onLoaded: (loaded: LlmModelLoadResult) => void;
};
type LoadedRuntime = {
  context: LlamaContext | null; vulkanLoaded: boolean; currentModelPath: string;
  multimodalInitialized: boolean; multimodalSupport: MultimodalSupport | null;
  toolCallingSupported: boolean; thinkingSupported: boolean;
  gpuEnabled: boolean; gpuReason: string; gpuDevices: string[];
  activeGpuLayers: number; totalModelLayers: number; requestedGpuLayers: number; gpuAttemptFailed: boolean;
};
type LoadedCandidate = { state: LoadedRuntime; actualLength: number; modelMaxContext: number | null };
export type LlmModelLoadResult = LoadedCandidate & {
  state: LoadedRuntime & {
    selectedBackend: InferenceBackend; requestedBackendAtLoad: InferenceBackend; acceleratorAttempts: string[];
  };
};

async function validateAndPrepareModel(modelPath: string, options: {
  override?: boolean; backendOverride?: InferenceBackend; onFileValidated: () => void;
}) {
  const { override = false, backendOverride, onFileValidated } = options;
  logger.log(`[LLM] validateAndPrepareModel: ${modelPath}`);
  if (!await RNFS.exists(modelPath)) throw new Error(`Model file not found at: ${modelPath}`);
  const validation = await validateModelFile(modelPath);
  if (!validation.valid) throw new Error(`Cannot load model: ${validation.reason}`);
  const rawSettings = useAppStore.getState().settings;
  const backend = backendOverride ?? rawSettings.inferenceBackend;
  // HTP only accelerates selected quants. OpenCL can also support Q4_K
  // (subject to the actual native runtime); let its load probe decide.
  const accelerated = backend === INFERENCE_BACKENDS.OPENCL || backend === INFERENCE_BACKENDS.HTP;
  const quant = modelPath.split('/').pop() ?? '';
  const htpEligible = /(?:^|[-_.])(q4_0|q8_0)(?:\.|-|_|$)/i.test(quant);
  const openclEligible = htpEligible || /(?:^|[-_.])q4_k(?:_[sml])?(?:\.|-|$)/i.test(quant);
  onFileValidated();
  if (Platform.OS === 'android' && accelerated && backend === INFERENCE_BACKENDS.HTP && !htpEligible) {
    throw new Error('This quantization is not supported by the NPU. Choose Auto to try another accelerator or explicitly select CPU.');
  }
  // OpenCL supports more quants than the HTP list; let the actual native load decide.
  void openclEligible;
  const contextLength = rawSettings.contextMode === 'auto'
    ? getMaxContextForDevice((await hardwareService.getDeviceInfo()).totalMemory)
    : rawSettings.contextLength;
  const settings = { ...rawSettings, inferenceBackend: backend, contextLength };
  logger.log(`[LLM] User settings: threads=${settings.nThreads}, batch=${settings.nBatch}, ctx=${settings.contextLength}, gpu=${settings.enableGpu}, flashAttn=${settings.flashAttn}, cache=${settings.cacheType}`);
  const recommendedThreads = await hardwareService.getRecommendedThreadCount();
  // nThreads === 0 is the "auto" sentinel — substitute the hardware-recommended count.
  // Any explicit user choice (1–12) is respected as-is.
  const effectiveNThreads = settings.nThreads === 0 ? recommendedThreads : settings.nThreads;
  const params = buildModelParams(modelPath, { ...settings, nThreads: effectiveNThreads });
  logger.log(`[LLM] Resolved params: threads=${params.nThreads}, batch=${params.nBatch}, ctx=${params.ctxLen}, gpuLayers=${params.nGpuLayers}`);
  const fileStat = await RNFS.stat(modelPath);
  const fileSize = typeof fileStat.size === 'string' ? Number.parseInt(fileStat.size, 10) : fileStat.size;
  // Use the EFFECTIVE cache type, not the raw setting: OpenCL/HTP coerce the KV cache
  // to f16 (see buildModelParams), so keying off settings.cacheType alone would let the
  // guard use the cheaper quantized estimate and approve a context that then OOMs.
  const quantizedCache = !params.usesF16Cache;
  // Feed the pre-load gate the SAME reclaim-aware available RAM the residency gate uses (the single owner,
  // effectiveAvailableMB) so the two can never disagree. On Android the raw os_proc snapshot under-counts a
  // foreground load (the LMK hands background apps' physical pages to us), so a raw gate REFUSED a model
  // residency ADMITTED — 12GB Android Aggressive, device qwythos. iOS returns raw unchanged (no reclaim —
  // jetsam kills us), so iOS is untouched. Policy comes from the residency manager (the authoritative owner).
  const getMem = async (): Promise<{ available: number; total: number; used: number }> => {
    const raw = await hardwareService.getAppMemoryUsage();
    const availableMB = effectiveAvailableMB(raw.available / (1024 * 1024), raw.total / (1024 * 1024), {
      platform: Platform.OS,
      policy: modelResidencyManager.getLoadPolicy(),
    });
    return { ...raw, available: availableMB * 1024 * 1024 };
  };
  let memCheck = await checkMemoryForModel({ modelFileSize: fileSize, contextLength: params.ctxLen, getAvailableMemory: getMem, quantizedCache });
  if (!memCheck.safe) {
    // Don't just warn and load into a near-certain native allocator crash (the iOS
    // metal_buffer_type_alloc_buffer / Android litert OOM clusters). Reduce context
    // to the largest size that fits; only block when the weights alone can't fit.
    const downgrade = await resolveSafeContext({ fileSize, requestedCtx: params.ctxLen, quantizedCache, override, getAvailableMemory: getMem });
    params.ctxLen = downgrade.ctxLen;
    memCheck = downgrade.memCheck;
  }
  logger.log(`[LLM] Memory check: estimatedMB=${memCheck.estimatedMB.toFixed(0)}, availableMB=${memCheck.availableMB.toFixed(0)}, safe=${memCheck.safe}, ctx=${params.ctxLen}`);
  return { fileSize, memCheck, params };
}

async function resolveAndroidBackend(params: NativeInitParams, options: {
  safeGpuLayers: number; totalMemory: number; selectedBackend?: InferenceBackend; strictAcceleration: boolean;
}) {
  let safeGpuLayers = options.safeGpuLayers;
  let resolvedBaseParams = params.baseParams;
  const { totalMemory, selectedBackend, strictAcceleration } = options;
  const settings = useAppStore.getState().settings;
  const backend = selectedBackend ?? (settings?.inferenceBackend ?? INFERENCE_BACKENDS.CPU);
  if (backend === INFERENCE_BACKENDS.HTP) {
    // HTP routes to the Hexagon NPU, so the Adreno GPU layer caps do not apply; only
    // the ≤4GB floor does (the caps used to zero the NPU on 6GB phones too).
    if (!(await hardwareService.getSoCInfo()).hasNPU && strictAcceleration)
      throw new Error('HTP/NPU not supported by this device');
    safeGpuLayers = totalMemory / BYTES_PER_GB > 4 ? (settings?.gpuLayers || 99) : 0;
    resolvedBaseParams = { ...params.baseParams, devices: ['HTP0'] };
    const socInfo = await hardwareService.getSoCInfo();
    logger.log(`[LLM] HTP backend — offloading ${safeGpuLayers} layers to NPU (${socInfo.qnnVariant ?? 'unknown'})`);
  } else if (backend === INFERENCE_BACKENDS.OPENCL) {
    const capability = await hardwareService.getOpenCLCapability();
    if (!capability.supported) {
      if (strictAcceleration) throw new Error(`OpenCL GPU unavailable: ${capability.reason}`);
      logger.warn(`[LLM] OpenCL unavailable: ${capability.reason}; CPU selected by legacy policy`);
      safeGpuLayers = 0;
    } else {
      // Respect the Adreno-specific RAM cap — safeGpuLayers already has it applied.
      // Name the OpenCL device: the default list can also include the Hexagon NPU.
      if (capability.devices?.length) resolvedBaseParams = { ...params.baseParams, devices: capability.devices };
      logger.log(`[LLM] OpenCL backend — offloading ${safeGpuLayers} layers to GPU${capability.devices?.length ? ` (${capability.devices.join(', ')})` : ''}`);
    }
  } else {
    safeGpuLayers = 0;
    logger.log('[LLM] CPU backend selected');
  }
  return { safeGpuLayers, resolvedBaseParams };
}

async function initWithAutoContext(params: NativeInitParams, options: {
  selectedBackend?: InferenceBackend; strictAcceleration?: boolean; getCurrentContextLength: () => number | undefined;
}): Promise<ContextInitResult & { attemptedGpuLayers: number }> {
  const { selectedBackend, strictAcceleration = false, getCurrentContextLength } = options;
  const deviceInfo = await hardwareService.getDeviceInfo();
  // Pass model size + free RAM so iOS Metal offload is capped to what fits (the
  // uncapped 99-layer offload was overflowing Metal → SIGSEGV on memory-tight devices).
  let safeGpuLayers = getGpuLayersForDevice(deviceInfo.totalMemory, params.nGpuLayers, {
    modelBytes: params.fileSize,
    availableBytes: deviceInfo.availableMemory,
  });
  if (safeGpuLayers !== params.nGpuLayers) logger.log(`[LLM] GPU layers capped (${(deviceInfo.totalMemory / BYTES_PER_GB).toFixed(1)}GB RAM, ${Platform.OS}): ${params.nGpuLayers} → ${safeGpuLayers}`);
  let resolvedBaseParams: object = params.baseParams;
  if (Platform.OS === 'android') {
    ({ safeGpuLayers, resolvedBaseParams } = await resolveAndroidBackend(params, {
      safeGpuLayers, totalMemory: deviceInfo.totalMemory, selectedBackend, strictAcceleration,
    }));
  }
  if (strictAcceleration) requireGpuLayers(
    selectedBackend === INFERENCE_BACKENDS.HTP ? 'htp' : 'opencl', safeGpuLayers);
  // Cap the INITIAL context by device RAM. The KV cache + compute buffers scale
  // with n_ctx, so loading at the full 4096 on a 4GB phone spikes even a tiny
  // model past the ~2GB per-process limit → jetsam kill (confirmed: 2098MB on a
  // 4GB iPhone 12 mid-generation). The scale-down logic below never fired because
  // it only ever RAISES context; do the floor here so the first load is safe.
  const deviceCtxCap = getMaxContextForDevice(deviceInfo.totalMemory);
  const safeCtx = Math.min(params.ctxLen, deviceCtxCap);
  if (safeCtx !== params.ctxLen) logger.log(`[LLM] context capped for ${(deviceInfo.totalMemory / BYTES_PER_GB).toFixed(1)}GB RAM: ${params.ctxLen} → ${safeCtx}`);
  const initial = { ...await initContextWithFallback(resolvedBaseParams, { contextLength: safeCtx, nGpuLayers: safeGpuLayers, allowCpuFallback: !strictAcceleration }), attemptedGpuLayers: safeGpuLayers };
  const modelMax = getModelMaxContext(initial.context);
  const userIsOnDefault = getCurrentContextLength() === APP_CONFIG.maxContextLength;
  if (!modelMax || !userIsOnDefault || modelMax <= initial.actualLength) return initial;
  const deviceMaxCtx = getMaxContextForDevice(deviceInfo.totalMemory);
  const targetCtx = Math.min(modelMax, 4096, deviceMaxCtx);
  if (targetCtx <= initial.actualLength) return initial;
  logger.log(`[LLM] Model supports ${modelMax} ctx, RAM cap ${deviceMaxCtx}, scaling ${initial.actualLength} → ${targetCtx}`);
  try { await initial.context.release(); } catch (e) { logger.warn('[LLM] Error releasing initial context:', e); }
  return { ...await initContextWithFallback(resolvedBaseParams, { contextLength: targetCtx, nGpuLayers: safeGpuLayers, allowCpuFallback: !strictAcceleration }), attemptedGpuLayers: safeGpuLayers };
}

/** Multimodal init on a not-yet-published context; the service owns publication. */
export async function deriveMultimodalFromProjector(context: LlamaContext, modelPath: string, mmProjPath: string): Promise<{ initialized: boolean; support: MultimodalSupport }> {
  try {
    const sizeMB = Number((await RNFS.stat(mmProjPath)).size) / (1024 * 1024);
    logger.log(`[LLM] mmproj file size: ${sizeMB.toFixed(1)} MB`);
    if (sizeMB < 100) console.warn(`[LLM] WARNING: mmproj file seems too small (${sizeMB.toFixed(1)} MB)`);
  } catch (statErr) { console.error('[LLM] Failed to stat mmproj file:', statErr); }
  const devInfo = useAppStore.getState().deviceInfo;
  const useGpuForClip = Platform.OS === 'ios' && !devInfo?.isEmulator && (devInfo?.totalMemory ?? 0) > 4 * BYTES_PER_GB;
  const { initialized, support } = await initMultimodal(context, mmProjPath, useGpuForClip);
  logger.log(`[WIRE-VISION] ${JSON.stringify({ model: modelPath, mmProjPath, useGpuForClip, initialized, support })}`); // [WIRE] real multimodal init result
  return { initialized, support };
}

function deriveToolCallingSupport(context: LlamaContext): boolean {
  try {
    const jinja = (context as any)?.model?.chatTemplates?.jinja;
    logger.log('[LLM][TOOLS] Full jinja caps:', JSON.stringify(jinja));
    logger.log(`[WIRE-CAPS] ${JSON.stringify({ jinja })}`); // [WIRE] real chat-template tool caps
    const supported = !!(jinja?.defaultCaps?.toolCalls || jinja?.toolUse || jinja?.toolUseCaps?.toolCalls);
    logger.log('[LLM][TOOLS] toolCallingSupported =', supported);
    return supported;
  } catch (e) { logger.warn('[LLM] Error detecting tool calling support:', e); return false; }
}

async function describeLoadedContext(
  loaded: ContextInitResult & { attemptedGpuLayers: number },
  model: { modelPath: string; mmProjPath?: string; requestedGpuLayers: number },
): Promise<LoadedCandidate> {
  const { context, actualLength, gpuAttemptFailed, attemptedGpuLayers } = loaded;
  const { modelPath, mmProjPath, requestedGpuLayers } = model;
  logContextMetadata(context, actualLength);
  logger.log(`[LLM] Native lib: ${(context as any).androidLib || 'N/A'}`);
  // Derive every capability before the owner publishes context as ready.
  const multimodal = mmProjPath
    ? await deriveMultimodalFromProjector(context, modelPath, mmProjPath)
    : { initialized: false, support: await checkContextMultimodal(context) };
  const toolCallingSupported = deriveToolCallingSupport(context);
  const thinkingSupported = supportsNativeThinking(context);
  const gpuInfo = captureGpuInfo(context, gpuAttemptFailed, attemptedGpuLayers);
  const totalModelLayers = modelLayerTotal((context as any).model?.metadata);
  return {
    state: {
      context, vulkanLoaded: false, currentModelPath: modelPath,
      multimodalInitialized: multimodal.initialized, multimodalSupport: multimodal.support,
      toolCallingSupported, thinkingSupported, requestedGpuLayers, ...gpuInfo, totalModelLayers,
      activeGpuLayers: effectiveOffloadedLayers(gpuInfo.activeGpuLayers, totalModelLayers),
    },
    actualLength, modelMaxContext: getModelMaxContext(context),
  };
}

async function loadLlamaCandidate(request: ModelLoadRequest, candidate: {
  backend: InferenceBackend; params: ModelLoadParams; fileSize: number;
}, hooks: LoadHooks): Promise<LoadedCandidate> {
  const { backend, params, fileSize } = candidate;
  // Explicit accelerator candidates must confirm acceleration before success.
  const requireAcceleration = Platform.OS === 'android' && backend !== INFERENCE_BACKENDS.CPU;
  const loaded = await initWithAutoContext({ ...params, fileSize }, {
    selectedBackend: backend, strictAcceleration: requireAcceleration,
    getCurrentContextLength: hooks.getCurrentContextLength,
  });
  try {
    return await describeLoadedContext(loaded, {
      modelPath: request.modelPath, mmProjPath: request.mmProjPath, requestedGpuLayers: params.nGpuLayers,
    });
  } catch (error) {
    try { await loaded.context.release(); } catch { /* load failed */ }
    throw error;
  }
}

async function loadVulkanCandidate(request: ModelLoadRequest, params: ModelLoadParams, fileSize: number): Promise<LoadedCandidate> {
  const runtime = await vulkanEngine.runtimeStatus();
  if (runtime.status !== 'ok') throw new Error(describeVulkanStatus(runtime));
  // Same device-RAM cap as OpenCL; 99 means all layers that are safe here.
  const deviceInfo = await hardwareService.getDeviceInfo();
  const requestedLayers = getGpuLayersForDevice(deviceInfo.totalMemory,
    useAppStore.getState().settings.gpuLayers || 99,
    { modelBytes: fileSize, availableBytes: deviceInfo.availableMemory });
  requireGpuLayers('vulkan', requestedLayers);
  const contextLength = Math.min(params.ctxLen, 32768);
  const loaded = await vulkanEngine.loadModel(request.modelPath, requestedLayers, contextLength, params.nThreads);
  if (!/vulkan/i.test(loaded.backend)) throw new Error(`Native model reported ${loaded.backend}, not Vulkan`);
  if (loaded.offloadedGpuLayers === 0) throw new Error('Vulkan loaded the model with no GPU layers');
  let gpuReason = loaded.offloadedGpuLayers > 0 ? ''
    : 'Model header unreadable; showing the requested Vulkan layer count';
  // The Vulkan engine is text only: the projector is never loaded.
  if (request.mmProjPath) {
    gpuReason = 'Pictures are off on the Vulkan GPU engine (text only). Choose CPU for pictures.';
    logger.log('[LLM] Vulkan: loaded text only; the picture file is not used on this engine');
  }
  return {
    state: {
      context: null, vulkanLoaded: true, currentModelPath: request.modelPath,
      gpuEnabled: true, gpuDevices: [loaded.backend], totalModelLayers: loaded.totalLayers,
      requestedGpuLayers: requestedLayers, gpuAttemptFailed: false,
      activeGpuLayers: loaded.offloadedGpuLayers > 0 ? loaded.offloadedGpuLayers : requestedLayers,
      gpuReason, toolCallingSupported: false, thinkingSupported: false,
      multimodalInitialized: false, multimodalSupport: null,
    },
    actualLength: contextLength, modelMaxContext: null,
  };
}

async function candidatesForModel(request: ModelLoadRequest): Promise<InferenceBackend[]> {
  if (Platform.OS !== 'android' || request.requestedBackend !== INFERENCE_BACKENDS.AUTO) {
    return [request.requestedBackend];
  }
  const [acceleration, vulkan] = await Promise.all([
    hardwareService.getAccelerationCapability(), vulkanEngine.isAvailable(),
  ]);
  return [...acceleratorCandidates(
    { npu: acceleration.hasNpu, opencl: acceleration.hasGpu, vulkan },
    request.modelPath, !!request.mmProjPath,
  ), INFERENCE_BACKENDS.CPU];
}

/** Runs under the existing service mutex; the service alone publishes live state. */
export async function loadLlmModel(request: ModelLoadRequest, hooks: LoadHooks): Promise<void> {
  const auto = Platform.OS === 'android' && request.requestedBackend === INFERENCE_BACKENDS.AUTO;
  const candidates = await candidatesForModel(request);
  const failures: string[] = [];
  for (const backend of candidates) {
    let loaded: LoadedCandidate | undefined;
    try {
      const { fileSize, memCheck, params } = await validateAndPrepareModel(request.modelPath, {
        override: request.override, backendOverride: backend, onFileValidated: hooks.onFileValidated,
      });
      hooks.onPrepared(params);
      logger.log(`[LLM] Trying ${backend}: ctx=${params.ctxLen}, file=${(fileSize / (1024 * 1024)).toFixed(0)}MB, RAM=${memCheck.availableMB.toFixed(0)}MB`);
      loaded = backend === INFERENCE_BACKENDS.VULKAN
        ? await loadVulkanCandidate(request, params, fileSize)
        : await loadLlamaCandidate(request, { backend, params, fileSize }, hooks);
      hooks.onLoaded({ ...loaded, state: { ...loaded.state, selectedBackend: backend,
        requestedBackendAtLoad: request.requestedBackend, acceleratorAttempts: failures } });
      return;
    } catch (error: any) {
      // Publication can fail too; release the candidate before clearing state.
      if (loaded?.state.context) {
        try { await loaded.state.context.release(); } catch { /* load failed */ }
      }
      const message = String(error?.message || error || 'Native load failed');
      if (backend === INFERENCE_BACKENDS.VULKAN) {
        try { await vulkanEngine.unload(); } catch { /* bridge may be unavailable */ }
      }
      hooks.onFailed(backend, message);
      failures.push(`${backend}: ${message.slice(0, 180)}`);
      // Keep typed memory refusals so the UI can still offer Load Anyway.
      if (isOverridableMemoryError(error)) throw error;
      if (!auto) {
        if (backend === INFERENCE_BACKENDS.VULKAN) {
          throw new Error(`Vulkan GPU unavailable: ${message}. Select CPU explicitly to continue.`);
        }
        throw new Error(message);
      }
      // A timed-out context can still be initializing. Do not race another backend.
      if (/timed out after/i.test(message)) break;
    }
  }
  hooks.onExhausted(failures);
  throw new Error(`No compatible backend could load this model (including CPU). ${failures.join(' | ')}`);
}
