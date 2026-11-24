/**
 * "Check against my sources": each claim of a reply is looked for in the person's own documents (the chat's project, else the offline
 * library) and marked as supported by a passage, in conflict with one (the passage gives a different number), or not found. The judging is
 * code (the words and numbers of the claim must be in the passage), not the model's opinion of its own answer, so a wrong answer cannot
 * vouch for itself. The other check ("Check this answer") asks the model to go through its own claims; this one looks them up.
 */
import { libraryToolAnswer } from '../atlasTools/offlineLibrary';
import { retrievalService } from './rag/retrieval';

export interface ClaimCheck { claim: string; verdict: 'supported' | 'conflict' | 'unverified'; source?: string; passage?: string }

const MAX_CLAIMS = 6;
const STOP = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'their', 'there', 'about', 'which', 'when', 'what', 'also', 'into', 'than', 'then', 'them', 'they', 'your', 'more', 'most', 'some', 'such', 'only', 'other', 'these', 'those', 'because']);
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const plain = (s: string) => s.replace(/[*_`#>|]/g, '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
const normalNumber = (n: string) => n.replace(/,/g, '').replace(/\.0+$/, '');
const significantWords = (s: string): string[] => [...new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)))];
const numbersIn = (s: string): string[] => (s.match(NUMBER) ?? []).map(normalNumber);

/** The sentences of a reply that state something checkable: a figure, a name, a date or a plain statement of fact. At most six. Pure. */
export function claimsOf(reply: string): string[] {
  const sentences = plain(reply.replace(/```[\s\S]*?```/g, ' ')).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim());
  const factual = sentences.filter((s) => s.length >= 30 && s.length <= 300 && !/\?$/.test(s) && !/^(sure|here|i |let me|hope|note that|of course|certainly)\b/i.test(s) && (/\d/.test(s) || /\b[A-Z][a-z]{2,}/.test(s.slice(1)) || /\b(is|are|was|were|has|have|means|causes|requires)\b/i.test(s)));
  return factual.slice(0, MAX_CLAIMS);
}

/** Whether a passage backs up a claim: its numbers are in the passage and most of its significant words are too; or the passage speaks of the same thing with other numbers. Pure. */
export function judgeClaim(claim: string, passage: string): 'supported' | 'conflict' | 'unverified' {
  const words = significantWords(claim);
  if (!words.length) return 'unverified';
  const there = passage.toLowerCase();
  const share = words.filter((w) => there.includes(w.slice(0, Math.max(4, w.length - 2)))).length / words.length;
  const claimNumbers = numbersIn(claim);
  const passageNumbers = new Set(numbersIn(passage));
  const missing = claimNumbers.filter((n) => !passageNumbers.has(n));
  if (share >= 0.6 && missing.length === 0) return 'supported';
  if (share >= 0.6 && claimNumbers.length > 0 && passageNumbers.size > 0) return 'conflict';
  return 'unverified';
}

/** The passages to look in for a claim, each with the name it came from. */
async function passagesFor(claim: string, projectId: string | undefined): Promise<Array<{ source: string; text: string }>> {
  if (projectId) {
    const found = await retrievalService.search(projectId, claim, 3);
    return found.chunks.map((c) => ({ source: c.name, text: c.content }));
  }
  const text = await libraryToolAnswer(claim);
  return /^(No offline library|Nothing found)/.test(text) ? [] : [{ source: 'the offline library', text }];
}

/** Looks every claim of the reply up and says what the documents say. Throws a plain sentence when there is nothing to look in. */
export async function checkAgainstSources(reply: string, projectId: string | undefined): Promise<ClaimCheck[]> {
  const claims = claimsOf(reply);
  const out: ClaimCheck[] = [];
  let anySource = false;
  for (const claim of claims) {
    let best: ClaimCheck = { claim, verdict: 'unverified' };
    for (const p of await passagesFor(claim, projectId).catch(() => [])) {
      anySource = true;
      const verdict = judgeClaim(claim, p.text);
      if (verdict === 'supported') { best = { claim, verdict, source: p.source, passage: p.text.slice(0, 200) }; break; }
      if (verdict === 'conflict' && best.verdict !== 'conflict') best = { claim, verdict, source: p.source, passage: p.text.slice(0, 200) };
    }
    out.push(best);
  }
  if (!claims.length) throw new Error('That reply has no statements of fact to check.');
  if (!anySource) throw new Error('There is nothing to check against: add documents to this chat\'s project, or an offline library.');
  return out;
}

/** The result as a note for the chat. Pure. */
export function sourceCheckNote(checks: ClaimCheck[]): string {
  const group = (v: ClaimCheck['verdict']) => checks.filter((c) => c.verdict === v);
  const lines: string[] = ['Checked against your sources:'];
  const ok = group('supported'); const bad = group('conflict'); const none = group('unverified');
  if (ok.length) lines.push(`Supported (${ok.length}):`, ...ok.map((c) => `- ${c.claim} (${c.source})`));
  if (bad.length) lines.push(`Conflicts with a source (${bad.length}):`, ...bad.map((c) => `- ${c.claim}\n  ${c.source} says: ${c.passage?.replace(/\s+/g, ' ')}`));
  if (none.length) lines.push(`Not found in your sources (${none.length}):`, ...none.map((c) => `- ${c.claim}`));
  lines.push('Not found does not mean wrong: it means your documents do not say.');
  return lines.join('\n');
}

/** Checks a reply and puts the result, or the plain reason it could not be done, in the conversation as a note (never sent to the model). */
export async function addSourceCheckNote(conversationId: string, reply: string, projectId: string | undefined): Promise<void> {
  let content: string;
  try { content = sourceCheckNote(await checkAgainstSources(reply, projectId)); }
  catch (e) { content = `Could not check against your sources: ${String((e as Error)?.message ?? e)}`; }
  require('../stores/chatStore').useChatStore.getState().addMessage(conversationId, { role: 'assistant', content, isSystemInfo: true });
}
