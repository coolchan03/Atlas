/**
 * A separate model for writing in the background (lessons, music, the briefing, games): a smaller, faster one than the model used for chat,
 * chosen in My models. Before a background question the chosen model is loaded; when the background work has been quiet for a while the chat
 * model is loaded again. With nothing chosen (the default) everything uses the selected model as before.
 * The person's chat choice (`activeModelId`) is never changed by this: only which model is loaded, so a restart or a chat sent in between
 * still uses the chat model.
 */
import logger from '../utils/logger';

const RESTORE_AFTER_MS = 45_000;
let switched = false;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

/** The model chosen for background writing, if it is still on the phone. */
export function backgroundModelId(): string | null {
  try {
    const { useAppStore } = require('../stores/appStore');
    const st = useAppStore.getState();
    const id: string | undefined = st.settings.backgroundModelId;
    return id && st.downloadedModels.some((m: { id: string }) => m.id === id) ? id : null;
  } catch { return null; }
}

/** Loads the background model when one is chosen and is not the loaded one. Returns true when a background model is the one to use. */
export async function useBackgroundModelNow(): Promise<boolean> {
  if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; } // more work is starting: the chat model waits
  const bg = backgroundModelId();
  if (!bg) return false;
  const { useAppStore } = require('../stores/appStore');
  const st = useAppStore.getState();
  if (st.loadedTextModelId !== bg) {
    const chat = st.activeModelId;
    logger.log('[AI] loading the background model for this work (the chat model comes back afterwards)');
    try {
      await require('../atlasTools/models').ensureTextModel(bg);
      switched = true; // only now is there a background model to switch back from
    } finally {
      // Loading selects the model it loads, and a load that throws may have done so too: the person's chat choice is put back either way.
      useAppStore.getState().setActiveModelId(chat);
    }
  }
  return true;
}

/** A failed restore (not enough memory yet, a busy engine) is tried again this many times, sooner each time it is worth it. */
const RESTORE_RETRIES = 2;
const RETRY_AFTER_MS = 15_000;

/** Puts the chat model back once the background work has been quiet for a while (and nothing is being written right now). */
export function scheduleChatModelRestore(attempt = 0, delayMs = RESTORE_AFTER_MS): void {
  if (!switched) return;
  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(async () => {
    restoreTimer = null;
    try {
      const { llmService } = require('../services/llm');
      if (llmService.isCurrentlyGenerating()) { scheduleChatModelRestore(attempt, RETRY_AFTER_MS); return; } // never while something is being written
      const { useAppStore } = require('../stores/appStore');
      const st = useAppStore.getState();
      if (st.loadedTextModelId === backgroundModelId() && st.activeModelId && st.activeModelId !== st.loadedTextModelId) {
        logger.log('[AI] background work is quiet: loading the chat model again');
        await require('../atlasTools/models').ensureTextModel(st.activeModelId); // whatever the person has chosen now
      }
      switched = false; // done only once the chat model is really back (or was never displaced: the person already loaded something else)
    } catch (e) {
      logger.warn(`[AI] could not load the chat model again: ${String((e as Error)?.message || e)}`);
      // Still switched: try again shortly instead of leaving the chat without its model until the person opens it.
      if (attempt < RESTORE_RETRIES) scheduleChatModelRestore(attempt + 1, RETRY_AFTER_MS); else switched = false;
    }
  }, delayMs);
  (restoreTimer as { unref?: () => void }).unref?.();
}
