/**
 * A separate model for writing in the background (lessons, music, the briefing, games): a smaller, faster one than the model used for chat,
 * chosen in My models. Before a background question the chosen model is loaded; when the background work has been quiet for a while the chat
 * model is loaded again. With nothing chosen (the default) everything uses the selected model as before.
 */
import logger from '../utils/logger';

const RESTORE_AFTER_MS = 45_000;
let chatModelId = '';
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

/** The model chosen for background writing, if it is still on the phone. */
export function backgroundModelId(): string | null {
  try {
    const { useAppStore } = require('../stores/appStore');
    const st = useAppStore.getState();
    const id: string | undefined = st.settings.backgroundModelId;
    return id && st.downloadedModels.some((m: { id: string; engine?: string }) => m.id === id && (m.engine ?? 'llama') === 'llama') ? id : null;
  } catch { return null; }
}

/** Loads the background model when one is chosen and is not the loaded one. Returns true when a background model is the one to use. */
export async function useBackgroundModelNow(): Promise<boolean> {
  const bg = backgroundModelId();
  if (!bg) return false;
  const { useAppStore } = require('../stores/appStore');
  const st = useAppStore.getState();
  if (st.loadedTextModelId !== bg) {
    if (!chatModelId) chatModelId = st.loadedTextModelId || st.activeModelId || '';
    logger.log(`[AI] loading the background model for this work (the chat model ${chatModelId || 'unknown'} comes back afterwards)`);
    await require('../atlasTools/models').ensureTextModel(bg);
  }
  return true;
}

/** Puts the chat model back once the background work has been quiet for a while (and nothing is being written right now). */
export function scheduleChatModelRestore(): void {
  if (!chatModelId) return;
  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(async () => {
    restoreTimer = null;
    try {
      const { llmService } = require('../services/llm');
      if (llmService.isCurrentlyGenerating()) { scheduleChatModelRestore(); return; }
      const back = chatModelId;
      chatModelId = '';
      if (back && back !== backgroundModelId()) { logger.log('[AI] background work is quiet: loading the chat model again'); await require('../atlasTools/models').ensureTextModel(back); }
    } catch (e) { logger.warn(`[AI] could not load the chat model again: ${String((e as Error)?.message || e)}`); }
  }, RESTORE_AFTER_MS);
  (restoreTimer as { unref?: () => void }).unref?.();
}
