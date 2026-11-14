/**
 * Sources for a topic course: pages the AI finds online (you choose which to keep), notes you paste and text files you pick.
 * Squares are then written from the best-matching passages of these instead of from the model's memory alone.
 * The pure parts (matching a square to passages, reading the AI's picks) are tested without a device.
 */
import { str } from '../study/games/json';
import { applyAnswerKey, extractQuestions, isQuestionBankText, parseAnswerKey, type BookQuestion } from '../study/bookQuestions';

export interface CourseSource {
  id: string;
  title: string;
  /** web: found online. note: pasted. file: a text file. */
  kind: 'web' | 'note' | 'file';
  url?: string;
  text: string;
  addedAt: number;
  /** A question bank (mostly questions, maybe with an answer key): its questions are used for quizzes and exams, and it is never taught from as reading. */
  questionBank?: boolean;
}

export interface Candidate { title: string; snippet: string; url: string }

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'how', 'are', 'you', 'your', 'about', 'into', 'its', 'can', 'will', 'use', 'using']);
const words = (text: string) => (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w));

/** Passages of about [size] characters, cut at paragraph or sentence ends. */
export function passages(text: string, size = 600): string[] {
  const out: string[] = [];
  let current = '';
  for (const piece of text.replace(/\r/g, '').split(/\n{2,}|(?<=[.!?])\s+/)) {
    if (!piece.trim()) continue;
    if ((current + piece).length > size && current) { out.push(current.trim()); current = ''; }
    current += `${piece} `;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** The passages of all sources that best match what a square covers, within a character budget. */
export function relevantExcerpts(sources: CourseSource[], query: string, maxChars = 1800): { source: string; text: string }[] {
  const want = new Set(words(query));
  if (!want.size) return [];
  const scored: { source: string; text: string; score: number }[] = [];
  for (const s of sources) {
    if (s.questionBank) continue; // a question bank is asked from, not read as a lesson
    for (const p of passages(s.text)) {
      const have = new Set(words(p));
      let shared = 0;
      want.forEach((w) => { if (have.has(w)) shared++; });
      if (shared >= 2) scored.push({ source: s.title, text: p, score: shared / Math.sqrt(have.size + 1) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const out: { source: string; text: string }[] = [];
  let used = 0;
  for (const c of scored) {
    if (used + c.text.length > maxChars) continue;
    out.push({ source: c.source, text: c.text });
    used += c.text.length;
    if (out.length >= 4) break;
  }
  return out;
}

/** The question put to the AI: which of these search results are the best to learn from. */
export function pickPrompt(ask: { topic: string; goal: string; found: Candidate[]; keep?: number }) {
  const { topic, goal, found, keep = 4 } = ask;
  return {
    system: 'You choose good learning sources. Answer only with numbers.',
    user: `A learner wants to study: ${topic}${goal ? ` (goal: ${goal})` : ''}.
Pick the ${keep} search results that look most useful and trustworthy for learning it: prefer documentation, universities, textbooks, established educational sites and clear explainers; avoid ads, shops, forums and thin pages.
${found.map((c, i) => `${i + 1}. ${c.title} - ${c.snippet.slice(0, 160)} (${c.url})`).join('\n')}
Reply with the numbers of the ${keep} best, separated by commas.`,
  };
}

/** The positions the AI picked (zero-based), in its order, without repeats. */
export function parsePicks(reply: string, count: number): number[] {
  const out: number[] = [];
  for (const m of reply.matchAll(/\d+/g)) {
    const n = Number(m[0]) - 1;
    if (n >= 0 && n < count && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The most text kept from a note or file, and from a question bank (a bank is long and every question matters). */
const KEEP_TEXT = 12000;
const KEEP_BANK = 300000;

/** A note or file turned into a source. A text that is mostly questions is recognised as a question bank and kept in full. */
export const makeSource = (s: { title: string; kind: CourseSource['kind']; text: string; url?: string }, id: string): CourseSource => {
  const bank = s.kind !== 'web' && isQuestionBankText(s.text);
  return { id, title: str(s.title, 80) || 'Untitled', kind: s.kind, url: s.url, text: s.text.replace(/\s+\n/g, '\n').slice(0, bank ? KEEP_BANK : KEEP_TEXT), addedAt: Date.now(), ...(bank ? { questionBank: true } : {}) };
};

/** Every question in the question-bank sources of a course, with answers from a key at the end where the bank has one. */
export function sourceQuestions(sources: CourseSource[] | undefined): BookQuestion[] {
  const out: BookQuestion[] = [];
  for (const src of sources ?? []) {
    if (!src.questionBank) continue;
    const found = new Map<string, BookQuestion>();
    for (const q of extractQuestions(src.text, src.title)) found.set(q.question.slice(0, 240).toLowerCase(), q);
    out.push(...applyAnswerKey([...found.values()], parseAnswerKey(src.text)));
  }
  return out;
}

export const MAX_SOURCES = 12;

/**
 * The opening of each added file, kept as a source so the course plan knows what the material covers (contents pages and
 * introductions are usually first). The whole file is searched later, from the project, when each square is written.
 */
export async function outlineSources(files: Array<{ path: string; name: string }>): Promise<CourseSource[]> {
  const { documentService } = require('../services/documentService');
  const out: CourseSource[] = [];
  for (const f of files) {
    try {
      const text: string = await documentService.textFromPicked(f.path, f.name, 6000);
      if (text.trim().length >= 50) out.push(makeSource({ title: f.name, kind: 'file', text }, `file-${Date.now()}-${out.length}`));
    } catch { /* the file is still in the project; it just adds no outline */ }
  }
  return out;
}
