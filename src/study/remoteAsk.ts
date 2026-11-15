/**
 * Writing lessons with the model the person chose for chat, when that is a bigger model on a server. Lessons, quizzes and learning reports
 * go through askModel, which only used the model on the phone; a small phone model makes more mistakes on tax and accounting, so when a
 * remote model is active it writes these too. Null when none is active (the phone's model is then used), or when the server fails (the
 * phone's model is the fallback, so a lesson is still written).
 */
import { useAppStore, useRemoteServerStore } from '../stores';
import { providerRegistry } from '../services/providers';
import logger from '../utils/logger';

/** Lessons are long: even if chat is set to short answers, leave room for a whole lesson. */
const MIN_TOKENS = 4000;
/** The longest a lesson waits for the server before the phone's model takes over. */
const MAX_WAIT_MS = 5 * 60_000;

export function remoteActive(): boolean {
  const { activeServerId, activeRemoteTextModelId } = useRemoteServerStore.getState();
  return !!activeServerId && !!activeRemoteTextModelId && providerRegistry.hasProvider(activeServerId);
}

export async function askRemote(system: string, user: string): Promise<string | null> {
  if (!remoteActive()) return null;
  const provider = providerRegistry.getProvider(useRemoteServerStore.getState().activeServerId as string);
  if (!provider) return null;
  const s = useAppStore.getState().settings;
  try {
    const reply = await new Promise<string>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('The server took too long')), MAX_WAIT_MS);
      const done = <T,>(fn: (v: T) => void) => (v: T) => { clearTimeout(timer); fn(v); };
      Promise.resolve(provider.generate(
        [{ id: 's', role: 'system', content: system, timestamp: 0 }, { id: 'u', role: 'user', content: user, timestamp: 0 }],
        { temperature: Math.min(s.temperature ?? 0.4, 0.5), maxTokens: Math.max(s.maxTokens || 0, MIN_TOKENS), topP: s.topP, enableThinking: false },
        { onToken: (t: string) => { text += t; }, onReasoning: () => undefined, onComplete: done((r: { content: string }) => resolve(r?.content || text)), onError: done(reject) },
      )).catch(done(reject));
    });
    // An empty answer is a failed one: the phone's model writes it instead.
    return reply.trim() ? reply : null;
  } catch (e) {
    logger.warn(`[Study] remote model failed, using the phone's model: ${String((e as Error)?.message || e).slice(0, 120)}`);
    return null;
  }
}
