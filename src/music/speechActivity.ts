/** Native speech event state, including queued podcast/briefing utterances. Never persist this. */
const activeUtterances = new Set<string>();
const listeners = new Set<(active: boolean) => void>();
let lastActive = false;
function publish(): void {
  const value = activeUtterances.size > 0;
  if (value === lastActive) return;
  lastActive = value;
  for (const listener of [...listeners]) listener(value);
}
export function markSpeechStarted(key: string): void {
  if (!key) return;
  activeUtterances.add(key);
  publish();
}
export function markSpeechFinished(key: string): void {
  activeUtterances.delete(key);
  publish();
}
/** A hard TTS stop interrupts all queued utterances and must restore music volume. */
export function clearSpeechActivity(): void { activeUtterances.clear(); publish(); }
export function hasActiveSpeech(): boolean { return lastActive; }
export function watchSpeechActivity(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  listener(lastActive);
  return () => { listeners.delete(listener); };
}
