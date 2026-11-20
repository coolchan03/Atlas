/**
 * A long lesson written in pieces. On a slow model (a big one on this phone) one call for the whole lesson takes more than a quarter of an
 * hour, can run on without end, and loses everything when it fails. So: one short call for the outline (the headings and what each covers),
 * then the sections two at a time, each with only the passages that fit them, then one short call for the mistakes, the check question and
 * the key points. Every piece is small enough to finish and is kept as soon as it is written. Pure: the prompts, the reading and the grouping.
 */
import { parseJsonLoose, str } from '../study/games/json';
import type { SquareContent } from './formats';

export const OUTLINE_SHAPE = '{"sections": [{"heading": "...", "focus": "one line on what this section teaches"}]}  (4 to 7 sections that together cover the whole topic, in the order they are taught; headings only, no section text yet)';
export const PART_SHAPE = '{"sections": [{"heading": "the heading you were given", "text": "plain explanation, 2 to 4 short paragraphs, tables as rows of | cells | when the topic needs one", "example": "a worked example or code (optional)"}]}  (exactly the sections asked for, in that order)';
export const FINISH_SHAPE = '{"commonMistakes": ["a mistake learners make here and how to avoid it"], "quickCheck": {"q": "one question to test yourself", "a": "its answer"}, "keyPoints": ["..."]}  (2 or 3 common mistakes, 3 to 6 key points)';

/** How many sections one call writes. */
const SECTIONS_PER_CALL = 2;
/** The longest reply of one piece (see runaway.ts): two sections are far shorter than a whole lesson. */
export const PIECE_MAX_CHARS = 9000;

export interface Outline { heading: string; focus: string }

export function parseOutline(raw: string): Outline[] | null {
  const j = parseJsonLoose<{ sections?: Array<{ heading?: unknown; focus?: unknown }> }>(raw);
  const list = Array.isArray(j?.sections) ? j!.sections! : [];
  const out = list.map((s) => ({ heading: str(s?.heading, 80), focus: str(s?.focus, 200) })).filter((s) => s.heading).slice(0, 8);
  return out.length >= 2 ? out : null;
}

export const groupsOf = <T,>(items: T[], size = SECTIONS_PER_CALL): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

const words = (t: string): string[] => (t.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

/** The passages that fit these sections best (by the words they share with the headings and what each covers), at most `max`: a short prompt reads faster. */
export function passagesFor<T extends { text: string }>(excerpts: T[] | undefined, sections: Outline[], max = 4): T[] {
  if (!excerpts?.length) return [];
  const want = new Set(sections.flatMap((s) => words(`${s.heading} ${s.focus}`)));
  return excerpts
    .map((e, i) => ({ e, i, score: words(e.text).filter((w) => want.has(w)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i).slice(0, max).sort((a, b) => a.i - b.i).map((x) => x.e);
}

export const outlinePart = 'FIRST write only the outline of this lesson: the headings of its sections and, for each, one line on what it teaches. Do not write the sections yet.';
export const sectionsPart = (group: Outline[], all: Outline[]): string =>
  `The lesson has these sections, in order: ${all.map((s) => `"${s.heading}"`).join(', ')}. Now write ONLY ${group.length === 1 ? 'this section' : 'these sections'}: ${group.map((s) => `"${s.heading}" (${s.focus || 'what the heading says'})`).join('; ')}. Do not repeat what the other sections cover.`;
export const finishPart = (all: Outline[]): string => `The sections of this lesson are written: ${all.map((s) => `"${s.heading}"`).join(', ')}. Now write ONLY what goes with them: the common mistakes, one check question and the key points. Do not write the sections again.`;

export function parseFinish(raw: string): Pick<Extract<SquareContent, { kind: 'lesson' }>, 'keyPoints' | 'commonMistakes' | 'quickCheck'> | null {
  const j = parseJsonLoose<{ keyPoints?: unknown; commonMistakes?: unknown; quickCheck?: { q?: unknown; a?: unknown } }>(raw);
  if (!j) return null;
  const list = (v: unknown, max: number, len: number): string[] => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, max);
  const keyPoints = list(j.keyPoints, 8, 200);
  const commonMistakes = list(j.commonMistakes, 4, 240);
  const quickCheck = j.quickCheck && str(j.quickCheck.q, 240) && str(j.quickCheck.a, 240) ? { q: str(j.quickCheck.q, 240), a: str(j.quickCheck.a, 240) } : undefined;
  return keyPoints.length || commonMistakes.length || quickCheck ? { keyPoints, ...(commonMistakes.length ? { commonMistakes } : {}), ...(quickCheck ? { quickCheck } : {}) } : null;
}

