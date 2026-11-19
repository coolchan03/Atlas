/**
 * Background jobs (practice questions, lessons, reports, the briefing) are not chat replies. A chat reply may be held short (low battery,
 * a hot phone, a project set to short answers, a call's spoken style, an agent's own limit), but a job that must return a whole JSON
 * document or a full lesson cannot be cut off at 256 tokens: it would fail every time. While a background job runs, the chat-level limits
 * are not applied (agentStore.activeAgentOverrides asks here).
 */
let depth = 0;
/** A chat reply that is being written right now is never treated as background work, even while a job is open between its model calls. */
let chatProbe: () => boolean = () => false;
/** The chat generator says here whether a chat reply is being written (this file imports nothing, so there is no import cycle). */
export const setChatProbe = (probe: () => boolean): void => { chatProbe = probe; };
const chatIsGenerating = (): boolean => { try { return chatProbe(); } catch { return false; } };
export const inBackgroundWork = (): boolean => depth > 0 && !chatIsGenerating();
export async function asBackground<T>(job: () => Promise<T>): Promise<T> {
  depth += 1;
  try { return await job(); } finally { depth -= 1; }
}
