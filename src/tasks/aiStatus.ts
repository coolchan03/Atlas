/**
 * What model Atlas has loaded and what it is doing, for the Task center. Reads the app's model, its settings and the queue's activity;
 * nothing here changes anything. The text builder is pure (tested); the reader gathers the pieces and leaves out any it cannot read.
 */
import { describeNow } from '../services/aiActivity';

export interface AiStatusInput {
  model: { name: string; detail: string; loaded: boolean } | null;
  runningOn: string | null;
  job: string | null;
  chat: boolean;
  waiting: number;
  seconds?: number;
}
export interface AiStatusLines { model: string; runningOn: string | null; now: string }

export function aiStatusLines(i: AiStatusInput): AiStatusLines {
  const model = !i.model ? 'No model selected' : i.model.loaded ? `${i.model.name}${i.model.detail ? ` (${i.model.detail})` : ''}` : `${i.model.name} is selected but not loaded yet`;
  return { model, runningOn: i.model?.loaded ? i.runningOn : null, now: describeNow({ job: i.job, chat: i.chat, waiting: i.waiting, seconds: i.seconds }) };
}

const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** Reads the loaded model, how it is running and what the AI is doing right now. */
export function readAiStatus(): AiStatusLines {
  let model: AiStatusInput['model'] = null;
  let runningOn: string | null = null;
  let chat = false;
  try {
    const { useAppStore } = require('../stores/appStore');
    const { llmService } = require('../services/llm');
    const st = useAppStore.getState();
    const active = st.downloadedModels.find((m: { id: string }) => m.id === st.activeModelId);
    const loaded = !!llmService.isModelLoaded?.();
    if (active) model = { name: active.name, loaded, detail: [active.quantization, active.fileSize ? gb(active.fileSize) : ''].filter(Boolean).join(', ') };
    if (active && loaded) {
      const g = llmService.getGpuInfo?.();
      const backend = g ? (g.gpuBackend || (g.gpu ? 'GPU' : 'CPU')) : '';
      const threads = st.settings.nThreads ? `${st.settings.nThreads} threads` : '';
      const layers = g?.gpu && g.totalLayers ? `${g.gpuLayers}/${g.totalLayers} layers on the GPU` : '';
      runningOn = [backend, threads, layers, st.settings.contextLength ? `context ${st.settings.contextLength}` : ''].filter(Boolean).join(', ') || null;
    }
    chat = !!llmService.isCurrentlyGenerating?.();
  } catch { /* leave out what cannot be read */ }
  const { running, waiting } = require('../services/aiActivity').useAiActivity.getState();
  return aiStatusLines({ model, runningOn, job: running?.label ?? null, chat, waiting, seconds: running ? Math.round((Date.now() - running.since) / 1000) : undefined });
}

/** The name of the model that is loaded, to record on a job that uses the AI; undefined when none is. */
export function loadedModelName(): string | undefined {
  try {
    const { useAppStore } = require('../stores/appStore');
    const { llmService } = require('../services/llm');
    const st = useAppStore.getState();
    return llmService.isModelLoaded?.() ? st.downloadedModels.find((m: { id: string }) => m.id === st.activeModelId)?.name : undefined;
  } catch { return undefined; }
}
