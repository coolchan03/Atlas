/**
 * Automatic specialist routing, only where a specialist clearly does the job better than the regular AI. Today that is exact
 * arithmetic: a language model is unreliable on multi-digit sums, percentages and divisions, and the calculator is exact. Nothing
 * else is routed (no personas, no topic guesses). The tool is added for that one turn only; it never changes the chat's own tool
 * list, the selected character or the model, and it only applies in a chat that already runs with tools.
 */
const WORD_OPS = /\b(plus|minus|times|multiplied by|divided by|percent of|%\s*of)\b/i;
const SYMBOL_OP = /\d[\d,]*(?:\.\d+)?\s*(?:[-+*/×÷^]|x(?=\s*\$?\d))\s*\$?\d/;
const PERCENT_OF = /\d(?:\.\d+)?\s*%\s*of\s*\$?\d/i;
const HARD_NUMBER = /\d{3,}|\d\.\d|\d,\d{3}|%/;

/** Tool ids to add for this turn. Empty when the regular AI is fine. */
export function routeSpecialists(text: string, enabledTools: string[]): string[] {
  if (enabledTools.length === 0 || enabledTools.includes('calculator')) return [];
  const arithmetic = SYMBOL_OP.test(text) || PERCENT_OF.test(text) || (WORD_OPS.test(text) && /\d/.test(text));
  // Small sums (2 + 2) the model does fine; the calculator is for numbers it often gets wrong.
  return arithmetic && HARD_NUMBER.test(text) ? ['calculator'] : [];
}

const lastRouted = new Map<string, string[]>();
/** Remembers which tools were added for a conversation's latest turn, for "What this chat uses". */
export const noteRouted = (conversationId: string, ids: string[]): void => { if (ids.length) lastRouted.set(conversationId, ids); else lastRouted.delete(conversationId); };
export const routedForTurn = (conversationId: string): string[] => lastRouted.get(conversationId) ?? [];
