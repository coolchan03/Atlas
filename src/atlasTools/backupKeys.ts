/** Which stored values may go into a backup or a sync, and the removal of anything that looks like a credential. Pure, no imports. */
// Explicit persistent-store allowlist also permits restore on a fresh install.
// Add other reviewed store keys here as their schemas are audited.
export const RESTORABLE_STORE_KEYS = new Set([
  'local-llm-chat-storage', 'local-llm-app-storage', 'local-llm-project-storage',
  'atlas-agent-storage', 'atlas-learning', 'atlas-study', 'atlas-voice-settings',
  // Saved map places, Survival Manual notes, library list and app preferences.
  // (Secret fields are stripped by stripSensitiveFields; API keys live in the Keychain.)
  'atlas-maps', 'atlas-survival-manual', 'atlas-offline-library', 'atlas-off-grid',
  'atlas-chat-prefs', 'atlas-daily-brief', 'atlas-low-power', 'remote-servers',
  'atlas-study-progress', 'atlas-checklists', 'atlas-skills', 'atlas-schedule', 'atlas-topics', 'atlas-pins',
  // Language course: levels, stars, streak, written lessons, saved words and review schedule.
  'atlas-language',
  // Practice questions and review dates (textbook question banks), exam prep, study plan, About me, Home widgets, call choices.
  'atlas-exercises', 'atlas-cpa-prep', 'atlas-study-plan', 'atlas-about-me', 'atlas-custom-home-shortcuts-v1', 'atlas-call-prefs',
  'atlas-pressure-log', 'atlas-memory-choice-v1', 'atlas-ask-later',
]);

/**
 * Persisted stores that are deliberately NOT in a backup or sync, with the reason. A guard test requires every persisted store to be
 * in RESTORABLE_STORE_KEYS, handled by sync itself (recordings, voices), or listed here, so a new store cannot be forgotten.
 */
export const NOT_BACKED_UP: Record<string, string> = {
  'atlas-backup-reminder': 'when this phone last reminded about a backup',
  'atlas-pane-ratios': 'how this phone or tablet splits its screen',
  'atlas-trash': 'recently deleted items kept on this phone for a few days',
  'atlas-tasks': 'running and failed jobs of this phone, which cannot continue on another phone',
  'atlas-model-speed': 'measured speed of this phone\'s models',
  'atlas-slow-hint': 'a hint shown once on this phone',
  'atlas-storage-prefs': 'this phone\'s storage choices',
  'atlas-tuned-models': 'settings tuned for this phone\'s hardware',
  'atlas-instrumental-library-v1': 'points at audio files that exist only on this phone',
  'atlas-workflows': 'finished runs can hold bank statements and other private papers',
  'atlas-search-settings': 'holds a search API key',
  'atlas-recordings': 'synced record by record with its audio',
  'atlas-voice-profiles': 'synced with the voice samples',
  'atlas-voice-reference-metadata-v1': 'synced with the voice samples',
};
// Never export or restore credentials, vault contents, or authentication state.
export const EXCLUDED_BACKUP_KEYS = /auth|passphrase|lock|vault|keychain|credential|secret|token|api.?key|atlas-search-settings/i;
const SENSITIVE_FIELDS = /api.?key|secret|token|password|passphrase|credential/i;
// Settings about text length that merely contain the word "token" (maxTokens, contextTokens, tokensPerSecond).
// They are not credentials, and stripping them reset the value on every restore and sync.
const TOKEN_COUNT_FIELDS = /^(max|min|context|ctx|n|num|total|prompt|completion|generated|reserved)[-_]?tokens?($|[-_A-Z0-9])|^tokens[-_]?(per|limit|used|count|budget)/i;
const isSensitiveField = (key: string) => SENSITIVE_FIELDS.test(key) && !TOKEN_COUNT_FIELDS.test(key);
function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveFields);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !isSensitiveField(key))
      .map(([key, item]) => [key, stripSensitiveFields(item)]));
  }
  return value;
}
export function sanitizeBackupValue(raw: string): string | null {
  try { return JSON.stringify(stripSensitiveFields(JSON.parse(raw))); }
  catch { return null; }
}
