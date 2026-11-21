/**
 * Quick, Balanced and Deep: three presets for how the model answers, made only of settings that already exist (thinking, thinking depth,
 * and whether the reply is sized to the memory window or capped). Nothing new is stored: the mode is read back from the settings, and any
 * other combination reads as "Custom", so moving a slider by hand never leaves a preset claiming to be on.
 * - Quick: no thinking, and a short cap on the reply. The first words and the whole answer come sooner.
 * - Balanced: the normal behaviour (no forced thinking, reply sized to the memory window).
 * - Deep: thinking on at its highest depth, reply sized to the memory window, so it can reason and check its work before answering.
 * A model that cannot think ignores the thinking settings, so for it Deep behaves like Balanced (the picker says so).
 */
export type ResponseMode = 'quick' | 'balanced' | 'deep';

export interface ModeSettings {
  thinkingEnabled: boolean;
  thinkingLevel?: 'low' | 'medium' | 'high';
  maxTokensMode?: 'auto' | 'manual';
  maxTokens: number;
}

/** The reply length Quick caps at, in tokens (about 280 words). */
export const QUICK_MAX_TOKENS = 384;

export const RESPONSE_MODES: { id: ResponseMode; name: string; hint: string }[] = [
  { id: 'quick', name: 'Quick', hint: 'Short answers, no thinking. Fastest.' },
  { id: 'balanced', name: 'Balanced', hint: 'Normal answers.' },
  { id: 'deep', name: 'Deep', hint: 'Thinks and checks before answering. Slower.' },
];

type Patch = Partial<ModeSettings>;
/** What each mode sets. Balanced leaves the reply cap value alone (only the way it is chosen), so switching back does not lose a length the person set. */
export function settingsFor(mode: ResponseMode): Patch {
  switch (mode) {
    case 'quick': return { thinkingEnabled: false, maxTokensMode: 'manual', maxTokens: QUICK_MAX_TOKENS };
    case 'deep': return { thinkingEnabled: true, thinkingLevel: 'high', maxTokensMode: 'auto' };
    default: return { thinkingEnabled: false, maxTokensMode: 'auto' };
  }
}

/** The mode the settings amount to, or 'custom' when they match none. Pure. */
export function modeOf(s: ModeSettings): ResponseMode | 'custom' {
  const auto = (s.maxTokensMode ?? 'auto') === 'auto';
  if (s.thinkingEnabled) return s.thinkingLevel === 'high' && auto ? 'deep' : 'custom';
  if (auto) return 'balanced';
  return s.maxTokens === QUICK_MAX_TOKENS ? 'quick' : 'custom';
}
