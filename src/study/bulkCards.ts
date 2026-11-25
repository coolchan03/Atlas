/**
 * Flashcards from a long text (a lecture transcript): the text is cut into chunks of about a minute and a half of speech, the model drafts a
 * few cards per chunk under a grammar, and CODE keeps only the cards that are grounded: the answer's words must be in the chunk it came from,
 * the question must read as a question, and the same question is never kept twice. Each chunk is a numbered source, so a card shows the
 * passage it came from. No card is kept on the model's word alone.
 */
import { askShaped } from './engine';
import type { Card, Source, StudyResult } from './store';

const CHUNK_CHARS = 1100;
/** About an hour of speech; more than this is cut off and the person is told. */
export const MAX_CHUNKS = 60;
const PER_CHUNK = 4;
const GRAMMAR = 'root ::= card+\ncard ::= "Q: " qtext " | A: " atext "\\n"\nqtext ::= [^|\\n]{8,160}\natext ::= [^|\\n]{2,200}';
const SYSTEM = 'You make flashcards from a passage of a lecture or talk. Use ONLY the passage. Each card tests one fact the passage states. One card per line, exactly: Q: question | A: short answer. Nothing else.';

/** Cuts a text into chunks at sentence ends, none much longer than `size`. */
export function splitForCards(text: string, size = CHUNK_CHARS): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.?!])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const s of parts) {
    if (current && current.length + s.length + 1 > size) { chunks.push(current); current = s; } else current = current ? `${current} ${s}` : s;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

const words = (t: string): string[] => t.toLowerCase().match(/[a-z0-9]{4,}|\d+/g) ?? [];

/** The cards in a model's reply that pass the checks. `seen` holds the questions kept so far, so none repeats. */
export function groundedCards(raw: string, chunk: string, seen: Set<string>): Array<{ q: string; a: string }> {
  const inChunk = new Set(words(chunk));
  const out: Array<{ q: string; a: string }> = [];
  for (const line of raw.split('\n')) {
    const m = /^\s*Q:\s*(.+?)\s*\|\s*A:\s*(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const q = m[1].trim(); const a = m[2].trim();
    if (!/\?$/.test(q) && !/^(what|why|how|when|where|who|which|name|define|explain|list)\b/i.test(q)) continue;
    const key = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key) || key === a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()) continue;
    const answerWords = words(a);
    // An answer made of words the chunk never used was made up, not read.
    if (answerWords.length && answerWords.filter((w) => inChunk.has(w)).length / answerWords.length < 0.6) continue;
    seen.add(key);
    out.push({ q, a });
    if (out.length >= PER_CHUNK) break;
  }
  return out;
}

/** Makes the deck. `onProgress(done, total)` is told after each chunk; `stopped()` ends it early, keeping the cards made so far. */
export async function cardsFromTranscript(text: string, title: string, run: { onProgress?: (done: number, total: number) => void; stopped?: () => boolean } = {}): Promise<{ result: StudyResult; cut: boolean }> {
  const all = splitForCards(text);
  const chunks = all.slice(0, MAX_CHUNKS);
  const seen = new Set<string>();
  const cards: Card[] = [];
  const sources: Source[] = chunks.map((t, i) => ({ n: i + 1, doc: title, part: i + 1, text: t }));
  for (let i = 0; i < chunks.length && !run.stopped?.(); i += 1) {
    try {
      const raw = await askShaped(SYSTEM, `PASSAGE:\n${chunks[i]}\n\nMake up to ${PER_CHUNK} flashcards.`, { label: 'Making flashcards', maxTokens: 220, grammar: GRAMMAR });
      for (const c of groundedCards(raw, chunks[i], seen)) cards.push({ ...c, src: [i + 1] });
    } catch { /* a chunk the model could not do is skipped; the others still count */ }
    run.onProgress?.(i + 1, chunks.length);
  }
  if (!cards.length) throw new Error('No flashcards could be made from this text. A longer transcript, or a larger model, usually helps.');
  const used = new Set(cards.flatMap((c) => c.src));
  return { result: { kind: 'cards', createdAt: Date.now(), topic: title, title: `Flashcards: ${title}`, sources: sources.filter((s) => used.has(s.n)), cards }, cut: all.length > MAX_CHUNKS };
}
