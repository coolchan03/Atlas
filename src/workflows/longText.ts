/**
 * A text too long for one prompt is read in parts. Each part is read on its own, with the job in mind, and written down as short notes (names,
 * numbers, dates, decisions, actions); the notes of all parts are put together, and if they are still too long they are read again the same
 * way. The steps of the job then work from the notes, which fit. Nothing in the middle is dropped the way cutting the text would: every part
 * is read. A text of a few pages is read in a few calls; the limit is `MAX_PARTS`.
 *
 * Small models are poor note-takers (tried on a computer: one invented names, one answered "Nothing here" for every part, one wrote nonsense),
 * so code checks the notes: a line naming someone or giving a number that is not in the part is dropped, repeats are dropped, and a part with
 * no notes left contributes its most telling sentences (those with numbers, dates and words of decision or action), so no part is lost.
 */
import { fitPrompt } from '../services/llmJobQueue';

/** The most parts one pass reads (about 30 pages at 5,000 characters a part). Beyond it the job should use the Knowledge base instead. */
export const MAX_PARTS = 30;
const MAX_ROUNDS = 3;

export type AskPart = (system: string, user: string, label: string) => Promise<string>;

/** True when a text is short enough to be read whole at this budget (characters). */
export const fitsWhole = (text: string, budget: number): boolean => text.length <= Math.round(budget * 0.55);

/** Parts of at most `size` characters, cut between paragraphs where possible, else between sentences, else anywhere. Nothing is lost or repeated. Pure. */
export function splitIntoParts(text: string, size: number): string[] {
  const pieces: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (paragraph.length <= size) { pieces.push(paragraph); continue; }
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      for (let i = 0; i < sentence.length; i += size) pieces.push(sentence.slice(i, i + size));
    }
  }
  const parts: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 1 > size) { parts.push(current); current = piece; } else current = current ? `${current}\n${piece}` : piece;
  }
  if (current) parts.push(current);
  return parts.filter((p) => p.trim());
}

/** Words that mark a sentence worth keeping when the model gave nothing usable. */
const SALIENT = /\b(decid\w*|agree\w*|will|must|should|need\w*|due|deadline|by|before|until|action|todo|task|approve\w*|decision|plan\w*|ship\w*|send|book|pay|total|cost|budget|price)\b/gi;

/** The few sentences of a part that most look like facts to keep (numbers, dates, decisions, actions, names), in their order; the first sentence when none do. Pure. */
export function salientSentences(part: string, count = 3): string[] {
  const sentences = part.split(/(?<=[.!?])\s+|\n/).map((x) => x.trim()).filter(Boolean);
  const scored = sentences.map((text, order) => ({ text, order, score: (/\d/.test(text) ? 2 : 0) + (text.match(SALIENT)?.length ?? 0) + ((text.slice(1).match(/\b[A-Z][a-z]+/g)?.length ?? 0) * 0.5) }));
  const chosen = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.order - b.order);
  return (chosen.length ? chosen : scored.slice(0, 1)).map((x) => x.text);
}

/** Capitalised words that start a line without being a name. */
const NOT_NAMES = new Set(['the', 'this', 'that', 'these', 'those', 'we', 'they', 'it', 'he', 'she', 'there', 'here', 'also', 'note', 'notes', 'part', 'parts', 'decision', 'decisions', 'action', 'actions', 'item', 'items', 'meeting', 'team', 'everyone', 'someone', 'nothing', 'none', 'all', 'and', 'but', 'then', 'next', 'who', 'what', 'when', 'where', 'why', 'how', 'job', 'text', 'summary', 'details']);

const MAX_NOTE_LINES = 12;
const MAX_NOTE_LINE = 300;

/** Only the lines of a model's notes that can be true of the part: no name or number the part does not contain, no repeats, no bare labels. Pure. */
export function groundNotes(notes: string, part: string): string[] {
  const where = part.toLowerCase();
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of notes.split('\n')) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (line.length < 8 || line.length > MAX_NOTE_LINE || /^[A-Za-z ]+:$/.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    const names = (line.match(/\b[A-Z][a-z]{2,}/g) ?? []).filter((w) => !NOT_NAMES.has(w.toLowerCase()));
    const claimed = [...(line.match(/\d[\d.,:/]*/g) ?? []), ...names];
    if (claimed.some((word) => !where.includes(word.toLowerCase().replace(/[.,:]+$/, '')))) continue;
    seen.add(key);
    kept.push(line);
    if (kept.length >= MAX_NOTE_LINES) break;
  }
  return kept;
}

const SYSTEM = `You read one part of a longer text and write notes for a job. Keep every name, number, date, decision and action that matters for the job, as short plain lines. Leave out everything else. If nothing in this part matters for the job, write only: Nothing here.`;

/**
 * Notes on the whole text for the job, short enough for one prompt at `budget`. A text that already fits is returned as it is.
 * Throws a plain sentence when the text is longer than `MAX_PARTS` parts.
 */
export async function digestText(job: string, text: string, opts: { ask: AskPart; budget: number }): Promise<string> {
  const { ask, budget } = opts;
  const size = Math.round(budget * 0.55);
  let current = text;
  for (let round = 1; round <= MAX_ROUNDS && !fitsWhole(current, budget); round += 1) {
    const parts = splitIntoParts(current, size);
    if (parts.length > MAX_PARTS) throw new Error(`This text is too long to read in one go (${parts.length} parts, the limit is ${MAX_PARTS}). Put it in a Knowledge base project and ask from there.`);
    const notes: string[] = [];
    for (let i = 0; i < parts.length; i += 1) {
      const reply = (await ask(SYSTEM, `Job: ${job.slice(0, 400)}\n\nPart ${i + 1} of ${parts.length}:\n${parts[i]}\n\nNotes:`, `Reading part ${i + 1} of ${parts.length}`)).trim();
      const grounded = /^nothing here\.?$/i.test(reply) ? [] : groundNotes(reply, parts[i]);
      notes.push(`Part ${i + 1}:\n${(grounded.length ? grounded : salientSentences(parts[i])).join('\n')}`);
    }
    current = notes.join('\n\n');
  }
  return fitsWhole(current, budget) ? current : fitPrompt(current, size);
}
