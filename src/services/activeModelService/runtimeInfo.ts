import { useAppStore } from '../../stores';
import { llmService } from '../llm';
import { liteRTService } from '../litert';
import type { TextRuntimeInfo } from './types';

let lastLoadModelId: string | null = null;
let lastLoadDurationMs: number | null = null;

export function recordTextLoadDuration(modelId: string, durationMs: number): void {
  lastLoadModelId = modelId;
  lastLoadDurationMs = durationMs;
}

function baseInfo(modelId: string, model: any) {
  return {
    modelId,
    modelName: model.name,
    quantization: model.quantization,
    loadDurationMs: lastLoadModelId === modelId ? lastLoadDurationMs : null,
  };
}

function loadedLiteRTInfo(modelId: string, model: any): TextRuntimeInfo {
  const store = useAppStore.getState();
  const actual = liteRTService.getActiveBackend();
  const backend = actual === 'npu' ? 'NPU' : actual === 'gpu' ? 'GPU' : actual === 'cpu' ? 'CPU' : 'Unknown';
  const requested = store.settings.liteRTBackend;
  return {
    ...baseInfo(modelId, model),
    state: 'loaded',
    backend,
    backendDetail: actual === 'npu' ? 'LiteRT NPU' : actual === 'gpu' ? 'LiteRT GPU' : 'LiteRT CPU',
    contextLength: liteRTService.getContextUsage().max,
    fallbackNotice: requested && actual && requested !== actual
      ? `Requested ${requested.toUpperCase()}, but the model loaded on ${actual.toUpperCase()}.`
      : null,
  };
}

function loadedLlamaInfo(modelId: string, model: any): TextRuntimeInfo {
  const gpu = llmService.getGpuInfo();
  const npu = gpu.gpu && /HTP|NPU|HEXAGON|DSP/i.test(gpu.gpuBackend || '');
  return {
    ...baseInfo(modelId, model),
    state: 'loaded',
    backend: gpu.gpu ? (npu ? 'NPU' : 'GPU') : 'CPU',
    backendDetail: gpu.gpu ? (gpu.gpuBackend || (npu ? 'HTP' : 'OpenCL')) : 'CPU',
    contextLength: llmService.getPerformanceSettings().contextLength,
    gpuLayers: gpu.gpu ? gpu.gpuLayers : 0,
    fallbackNotice: llmService.getBackendFallbackNotice()
      ?? (llmService.isCpuForFileType()
        ? 'CPU chosen for this quantization; Q4_0/Q8_0 builds can use GPU/NPU acceleration.'
        : null),
  };
}

export function getTextRuntimeInfo(loadedTextModelId: string | null, isLoading: boolean): TextRuntimeInfo {
  const store = useAppStore.getState();
  const modelId = store.activeModelId;
  const model = store.downloadedModels.find(m => m.id === modelId);
  if (!modelId || !model) return { state: 'none', modelId: null };

  const base = baseInfo(modelId, model);
  if (isLoading) return { ...base, state: 'loading' };
  if (loadedTextModelId !== modelId) {
    return { ...base, state: store.textModelEvicted ? 'evicted' : 'selected' };
  }
  return model.engine === 'litert'
    ? loadedLiteRTInfo(modelId, model)
    : loadedLlamaInfo(modelId, model);
}
