/** Atlas: thinking levels instead of a plain on/off switch. */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

export const levelOf = (s: { thinkingEnabled?: boolean; thinkingLevel?: string }): ThinkingLevel =>
  !s.thinkingEnabled ? 'off' : ((s.thinkingLevel as ThinkingLevel) || 'medium');

/** Off -> Low -> Medium -> High -> Off */
export function nextLevel(s: { thinkingEnabled?: boolean; thinkingLevel?: string }): { thinkingEnabled: boolean; thinkingLevel?: ThinkingLevel } {
  const order: ThinkingLevel[] = ['off', 'low', 'medium', 'high'];
  const n = order[(order.indexOf(levelOf(s)) + 1) % order.length];
  return n === 'off' ? { thinkingEnabled: false } : { thinkingEnabled: true, thinkingLevel: n };
}

export const LEVEL_LABEL: Record<ThinkingLevel, string> = { off: 'OFF', low: 'LOW', medium: 'MED', high: 'HIGH' };

/** Added to the system prompt so the model spends about the right amount of effort thinking. */
export function thinkingNote(s: { thinkingEnabled?: boolean; thinkingLevel?: string }): string {
  switch (levelOf(s)) {
    case 'low': return '\n\nReasoning: low. Think only briefly (a few short sentences) before you answer.';
    case 'medium': return '\n\nReasoning: medium. Think step by step, but stay focused and do not repeat yourself.';
    case 'high': return '\n\nReasoning: high. Think carefully and thoroughly: break the problem down, consider alternatives, and check your work before you answer.';
    default: return '';
  }
}
