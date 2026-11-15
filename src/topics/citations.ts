/**
 * Checking a lesson against the passages it was written from. Pure, so it is tested without a device.
 *  - quotedSentence: the sentence of a passage that the lesson leans on most, to highlight when the passage is opened.
 *  - unbackedLines: lines of the lesson that none of the passages supports, so the learner knows what came from the model's memory.
 */
import type { SquareContent } from './formats';

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'will', 'can', 'its', 'has', 'have', 'not', 'but', 'you', 'your', 'when', 'which', 'then', 'than', 'they', 'their', 'there', 'also', 'such', 'into', 'each', 'any', 'all']);
const words = (t: string): string[] => (t.toLowerCase().match(/[a-z0-9$%.]{3,}/g) ?? []).map((w) => w.replace(/[.$%]+$/, '')).filter((w) => w.length >= 3 && !STOP.has(w));
const sentences = (t: string): string[] => t.replace(/\*\*/g, '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 12);

const overlap = (a: string[], b: Set<string>): number => (a.length ? a.filter((w) => b.has(w)).length / a.length : 0);

/** The words of a lesson's own text (sections, examples, key points), as one string. */
export function lessonText(content: SquareContent | null | undefined): string {
  if (!content || content.kind !== 'lesson') return '';
  return [...content.sections.flatMap((s) => [s.text, s.example ?? '']), ...content.keyPoints, ...(content.commonMistakes ?? [])].join('\n');
}

/** Splits a passage around the sentence the lesson leans on most; no hit (nothing shared) leaves the passage whole. */
export function quotedSentence(passage: string, lesson: string): { before: string; hit: string; after: string } {
  const lessonWords = new Set(words(lesson));
  let best = { score: 0, text: '' };
  for (const s of sentences(passage)) {
    const w = words(s);
    const shared = w.filter((x) => lessonWords.has(x)).length;
    const score = shared >= 3 ? shared / Math.sqrt(w.length + 1) : 0;
    if (score > best.score) best = { score, text: s };
  }
  if (!best.text) return { before: passage, hit: '', after: '' };
  const at = passage.indexOf(best.text);
  if (at < 0) return { before: passage, hit: '', after: '' };
  return { before: passage.slice(0, at), hit: best.text, after: passage.slice(at + best.text.length) };
}

/** Lines of the lesson that carry a fact (a number or a rule) that no passage backs. Nothing is flagged when there were no passages to check against. */
export function unbackedLines(content: SquareContent | null | undefined, passages: Array<{ text: string }>): string[] {
  if (!passages.length) return [];
  const have = new Set(words(passages.map((p) => p.text).join('\n')));
  const out: string[] = [];
  for (const line of sentences(lessonText(content))) {
    const w = words(line);
    const factual = /\d/.test(line) || /\b(must|always|never|only|requires?|is recorded|is defined)\b/i.test(line);
    if (factual && w.length >= 5 && overlap(w, have) < 0.4) out.push(line);
  }
  return out.slice(0, 4);
}
