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

/** The figures in a text, as plain digits ("$1,250" and "1250" are the same; "7.5%" is 7.5). Single digits and years are left out: they are in nearly everything. */
export function figuresIn(text: string): string[] {
  return [...new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, '').replace(/\.0+$/, '')).filter((n) => n.length >= 2 && !/^(19|20)\d{2}$/.test(n)))];
}

/**
 * A note for a quiz question whose right answer has a figure that the evidence (the passages the quiz was written from, and the question itself) does
 * not show: the AI may have worked it out wrongly or made it up. Null when every figure is shown, or when there is no evidence to check against.
 */
export function unverifiedFigure(question: { q: string; options: string[]; answer: number }, evidence: string): string | null {
  if (!evidence.trim()) return null;
  const have = new Set(figuresIn(`${evidence}\n${question.q}\n${question.options.filter((_, i) => i !== question.answer).join(' ')}`));
  const missing = figuresIn(question.options[question.answer] ?? '').filter((n) => !have.has(n));
  return missing.length ? `Check ${missing.slice(0, 2).join(' and ')} against your sources: the AI worked it out, and none of your passages show it.` : null;
}

/** A table row spoken as words ("Cash, 500, nothing"), and the divider row of a Markdown table dropped. */
function spokenLine(line: string): string {
  const t = line.trim();
  if (!t.startsWith('|')) return line;
  if (/^\|?[\s:|-]+\|?$/.test(t)) return '';
  return t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim() || 'nothing').join(', ');
}

/** What is read aloud for a lesson: each section's heading, text and example in order, then the key points; tables are read row by row. */
export function spokenLesson(content: SquareContent | null | undefined): string {
  if (!content || content.kind !== 'lesson') return '';
  const part = (t: string) => t.split('\n').map(spokenLine).filter((l, i, a) => l || a[i - 1]).join('\n');
  const body = content.sections.map((s) => [s.heading, part(s.text), s.example ? `For example. ${part(s.example)}` : ''].filter(Boolean).join('\n\n'));
  const points = content.keyPoints.length ? `Key points.\n${content.keyPoints.join('\n')}` : '';
  return [...body, points].filter(Boolean).join('\n\n');
}

/** How much of a line's words a text carries, 0 to 1. */
export function supportOf(line: string, text: string): number {
  return overlap(words(line), new Set(words(text)));
}

/** A lesson as markdown text, for saving as a Word document: each section with its heading and example, common mistakes, a quick check, key points. */
export function lessonMarkdown(title: string, content: SquareContent | null | undefined): string {
  if (!content || content.kind !== 'lesson') return '';
  const lines: string[] = [`# ${title}`, ''];
  for (const s of content.sections) {
    if (s.heading) lines.push(`## ${s.heading}`);
    lines.push(s.text, '');
    if (s.example) lines.push('**Example**', s.example, '');
  }
  if (content.commonMistakes?.length) lines.push('## Common mistakes', ...content.commonMistakes.map((k) => `- ${k}`), '');
  if (content.quickCheck) lines.push('## Quick check', content.quickCheck.q, `**Answer:** ${content.quickCheck.a}`, '');
  if (content.keyPoints.length) lines.push('## Key points', ...content.keyPoints.map((k) => `- ${k}`), '');
  return lines.join('\n').trim();
}
