/**
 * A chat message that is too big to answer well in one go: it asks for several things, or it is long next to the model's memory. Such a
 * message is done in small steps first (autoSteps.ts) and the model writes its answer from that work. Pure, so it is tested without a device.
 */
const CHARS_PER_TOKEN = 3;
/** Under this many characters a message is never split, whatever it asks. */
const MIN_CHARS = 160;
/** A message taking more than this share of the model's memory is long enough to be done in steps. */
const LONG_SHARE = 0.35;
const TASK_WORDS = /\b(summari[sz]e|list|write|make|compare|explain|translate|extract|rewrite|create|check|draft|plan|find|calculate)\b/gi;

/** A message that asks for several things, or says it wants steps. */
function asksSeveralThings(message: string): boolean {
  if (/\b(step by step|in steps|one at a time)\b/i.test(message)) return true;
  const asks = message.match(TASK_WORDS) ?? [];
  return asks.length >= 3 || (/\b(and then|after that|then|finally)\b[^.]*\b(summari[sz]e|list|write|make|compare|explain|translate|extract|rewrite|create|draft|plan)\b/i.test(message) && asks.length >= 2);
}

/** Whether the steps tool is worth offering for a message: it asks for several things, or it is long (whatever the model's memory). */
export const severalParts = (message: string): boolean => message.length > 900 || asksSeveralThings(message);

/** Whether the chat should do this message in steps before answering it. */
export function wantsSteps(message: string, contextTokens: number): boolean {
  const text = message.trim();
  if (text.length < MIN_CHARS) return false;
  if (text.length > contextTokens * CHARS_PER_TOKEN * LONG_SHARE) return true;
  return asksSeveralThings(text);
}
