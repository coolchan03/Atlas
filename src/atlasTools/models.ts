import { useAppStore } from '../stores/appStore';
import logger from '../utils/logger';

/**
 * Make sure a specific downloaded text model is the loaded one.
 * modelId empty/undefined = keep whatever is selected now.
 * Lazy requires keep the agent store free of heavy imports.
 */
export async function ensureTextModel(modelId?: string | null, onStatus?: (s: string) => void): Promise<void> {
  const st = useAppStore.getState();
  const target = modelId || st.activeModelId;
  if (!target) throw new Error('No model selected. Load a text model first (Models tab).');
  const { llmService } = require('../services/llm');
  if (st.loadedTextModelId === target && llmService.isModelLoaded()) return;
  const exists = st.downloadedModels.some((m) => m.id === target);
  if (!exists) throw new Error('That model is no longer downloaded.');
  const name = st.downloadedModels.find((m) => m.id === target)?.name || target;
  onStatus?.(`Loading ${name}...`);
  const { activeModelService } = require('../services/activeModelService');
  await activeModelService.loadTextModel(target);
}

/** Fire-and-forget switch used when an agent with a preferred model is chosen. */
export function switchToModelInBackground(modelId: string): void {
  const st = useAppStore.getState();
  if (!st.downloadedModels.some((m) => m.id === modelId)) return;
  if (st.loadedTextModelId === modelId || st.activeModelId === modelId) {
    if (st.loadedTextModelId === modelId) return;
  }
  ensureTextModel(modelId).catch((e) => logger.warn(`[Atlas] could not switch model: ${String(e?.message || e)}`));
}
