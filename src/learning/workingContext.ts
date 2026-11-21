/**
 * The temporary context for one learner step: only the stored notes (short, sourced claims) and deep passages that bear on the question,
 * best first, within a token budget, from ONE topic so two projects with similar subjects never mix. Nothing here is saved: the caller
 * uses the text for the step and drops it, while the full records stay in the knowledge database. Unreviewed notes are labelled as
 * such, so an unsupported assertion is never presented as a checked fact. Pure.
 */
import { similarity } from './claimText';

export interface NoteIn { id: string; text: string; status: string; topic?: string; source?: string; /** Always included first, whatever the question (the learner's active goal). */ pinned?: boolean }
export interface PassageIn { source: string; where?: string; text: string }
export interface WorkingContext {
  text: string;
  /** Notes and passages that made it in. */
  usedNotes: string[];
  usedPassages: number;
  /** Candidates dropped for lack of room (or cut short). */
  omitted: number;
  approxTokens: number;
}

/** The share of the model's context that stored notes and passages may fill in a step. The rest is for the task, the instructions and the reply (a step's own text is about 1200 tokens). */
export const KNOWLEDGE_SHARE = 0.45;
/** The most a step is ever given, however large the context: a very long context is for the reply and the passages being studied too. */
const MAX_KNOWLEDGE_TOKENS = 12000;

/**
 * How many tokens of notes and passages a step may use, from the loaded model's context window (a share of it, never under 200 or over
 * MAX_KNOWLEDGE_TOKENS) and halved when the phone is under pressure (low battery, hot). So a small model on a weak phone is never handed a
 * context it cannot hold, and a model with room for more is not held to a fixed small amount (it used to stop at 1800 tokens whatever the context).
 */
export function budgetFor(contextTokens: number, share: number, pressure = false): number {
  const base = Math.min(MAX_KNOWLEDGE_TOKENS, Math.max(200, Math.round((contextTokens || 2048) * share)));
  return pressure ? Math.max(150, Math.round(base / 2)) : base;
}

export const approxTokens = (text: string): number => Math.ceil(text.length / 4);
const LABEL: Record<string, string> = { verified: 'checked', candidate: 'not yet reviewed', disputed: 'DISPUTED', needs_review: 'needs review' };
const MIN_RELEVANCE = 0.15;

/** Builds the context. `budgetTokens` caps the whole text; notes come first (short and checked), then deep passages with what is left. */
export function buildWorkingContext(input: { question: string; topic: string; notes: NoteIn[]; passages?: PassageIn[]; budgetTokens: number }): WorkingContext {
  const { question, topic, budgetTokens } = input;
  let room = Math.max(0, budgetTokens);
  const lines: string[] = [];
  const usedNotes: string[] = [];
  let omitted = 0;

  const ranked = input.notes
    .filter((n) => !n.topic || n.topic === topic) // another project's note is never used
    .map((n) => ({ n, s: n.pinned ? 10 : similarity(question, n.text) * (n.status === 'verified' ? 1.15 : n.status === 'disputed' ? 0.6 : 1) }))
    .filter((x) => x.s > MIN_RELEVANCE)
    .sort((a, b) => b.s - a.s);
  ranked.forEach(({ n }, i) => {
    const line = `Note ${i + 1} (${LABEL[n.status] ?? n.status}${n.source ? `; ${n.source}` : ''}): ${n.text}`;
    const cost = approxTokens(line) + 1;
    if (cost > room) { omitted += 1; return; }
    room -= cost; lines.push(line); usedNotes.push(n.id);
  });

  let usedPassages = 0;
  const passages = (input.passages ?? [])
    .map((p) => ({ p, s: similarity(question, p.text) }))
    .filter((x) => x.s > MIN_RELEVANCE)
    .sort((a, b) => b.s - a.s);
  for (const { p } of passages) {
    const head = `Source (${p.source}${p.where ? `, ${p.where}` : ''}): `;
    const space = room - approxTokens(head) - 1;
    if (space < 40) { omitted += 1; continue; }
    const body = p.text.length > space * 4 ? `${p.text.slice(0, space * 4 - 1)}…` : p.text;
    if (body.length < p.text.length) omitted += 1; // cut short
    const line = head + body;
    room -= approxTokens(line) + 1; lines.push(line); usedPassages += 1;
  }
  const text = lines.join('\n');
  return { text, usedNotes, usedPassages, omitted, approxTokens: approxTokens(text) };
}
