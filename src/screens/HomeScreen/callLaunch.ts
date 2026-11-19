/**
 * What a call button says while it gets the call ready: waiting for a busy model, loading the model, starting the call. One store and one
 * function, used by every way of starting a call (a Home widget tile, the Call screen, a saved call), so each says the same words.
 */
import { create } from 'zustand';
import { useAppStore } from '../../stores/appStore';
import { activeModelService } from '../../services/activeModelService';
import { getActiveEngineService } from '../../services/engines';

interface CallLaunchState { status: string | null; widgetId: string | null }
export const useCallLaunch = create<CallLaunchState>(() => ({ status: null, widgetId: null }));

export const clearCallLaunch = (): void => useCallLaunch.setState({ status: null, widgetId: null });

const say = (status: string, widgetId?: string): void => useCallLaunch.setState({ status, widgetId: widgetId ?? null });
/** Whether the loaded text engine is in the middle of writing an answer (whichever engine it is). */
const engineBusy = (): boolean => {
  try { return !!(getActiveEngineService() as { isCurrentlyGenerating?: () => boolean } | null)?.isCurrentlyGenerating?.(); } catch { return false; }
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The longest to wait for a model that is busy writing an answer before going on anyway. */
const BUSY_WAIT_MS = 60_000;

/** The sentence for a model that is not ready, or '' when it is (pure, for tests). */
function modelNotice(o: { name: string; busy: boolean; loaded: boolean }): string {
  if (o.busy) return `${o.name} is busy writing an answer. Waiting for it to finish...`;
  return o.loaded ? 'Starting the call...' : `Loading ${o.name}... (this can take up to a minute)`;
}

/** Makes the call's model ready, saying what is happening on the way. Clears the status when it ends or fails; the caller clears it after the call opens. */
export async function prepareCallModel(modelId: string, widgetId?: string): Promise<void> {
  const name = useAppStore.getState().downloadedModels.find((m) => m.id === modelId)?.name ?? 'the model';
  try {
    if (engineBusy()) {
      say(modelNotice({ name, busy: true, loaded: true }), widgetId);
      for (let waited = 0; engineBusy() && waited < BUSY_WAIT_MS; waited += 500) await wait(500);
    }
    say(modelNotice({ name, busy: false, loaded: activeModelService.getLoadedModelIds().textModelId === modelId }), widgetId);
    await activeModelService.loadTextModel(modelId);
    say('Starting the call...', widgetId);
  } catch (error) { clearCallLaunch(); throw error; }
}
