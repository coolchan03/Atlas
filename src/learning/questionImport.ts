/**
 * Bring your own questions: paste tests, quizzes or exam papers in any layout and the AI reads them into one standard form,
 * which the person reviews before anything is added. The AI only reads and tidies; plain code validates every item, drops
 * repeats, and builds the answer key the exam scores against. A question is never changed into one the person did not write.
 */
import { extractJson, type Ask } from '../workflows/engine';
import { similarity } from './claimText';
import type { Expected } from './exams';

export interface NormalizedQuestion {
  question: string;
  /** The right answer as written, one fact per line when there are several. */
  answer: string;
  /** Other ways of saying the same answer. */
  alternatives: string[];
  /** Choices for a multiple-choice question, in order; the answer is one of them. */
  options?: string[];
  topic?: string;
  /** The explanation given with the question, if the text has one. */
  explain?: string;
}

const SAME = 0.8;
const MAX_QUESTIONS = 100;
const CHUNK = 6000;
const text = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Questions from the AI's reply, kept only when they have a question and an answer, and a multiple-choice answer that is one of its options. */
export function readNormalized(reply: string): NormalizedQuestion[] {
  const json = extractJson(reply) as { questions?: unknown } | unknown[] | null;
  const list = Array.isArray(json) ? json : (json as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];
  const out: NormalizedQuestion[] = [];
  for (const raw of list as Array<Record<string, unknown>>) {
    const question = text(raw?.question);
    let answer = text(raw?.answer);
    const options = Array.isArray(raw?.options) ? (raw.options as unknown[]).map((o) => text(o, 160)).filter(Boolean).slice(0, 8) : undefined;
    if (options && options.length >= 2) {
      // The answer may be given as a letter or number ("B", "2"): turn it into the option's own words so it can be checked.
      const index = /^[a-h]$/i.test(answer) ? answer.toLowerCase().charCodeAt(0) - 97 : /^\d$/.test(answer) ? Number(answer) - 1 : -1;
      if (index >= 0 && options[index]) answer = options[index];
      if (!options.some((o) => similarity(o, answer) >= 0.9)) continue;
    }
    if (!question || question.length < 6 || !answer) continue;
    const alternatives = Array.isArray(raw?.alternatives) ? (raw.alternatives as unknown[]).map((a) => text(a, 160)).filter(Boolean).slice(0, 6) : [];
    out.push({ question, answer, alternatives, options: options && options.length >= 2 ? options : undefined, topic: text(raw?.topic, 100) || undefined, explain: text(raw?.explanation, 600) || undefined });
  }
  return out;
}

/** Removes repeats, within the new questions and against questions already there. */
export function withoutRepeats(items: NormalizedQuestion[], existing: string[]): { kept: NormalizedQuestion[]; repeats: number } {
  const seen = [...existing];
  const kept: NormalizedQuestion[] = [];
  for (const item of items) {
    if (seen.some((q) => similarity(q, item.question) >= SAME)) continue;
    seen.push(item.question);
    kept.push(item);
  }
  return { kept, repeats: items.length - kept.length };
}

/** The answer key an exam scores against: each line of the answer is a fact, and its other wordings count too. */
export function toExpected(item: NormalizedQuestion): Expected {
  const lines = item.answer.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const facts = lines.map((line, i) => (i === 0 ? [line, ...item.alternatives] : [line]));
  return { facts };
}

/** Which questions go to the exam and which to study. "split" keeps every fourth question back for the exam. */
export type ImportTarget = 'study' | 'exam' | 'split';
export function divide(items: NormalizedQuestion[], target: ImportTarget): { exam: NormalizedQuestion[]; study: NormalizedQuestion[] } {
  if (target === 'exam') return { exam: items, study: [] };
  if (target === 'study') return { exam: [], study: items };
  return { exam: items.filter((_, i) => i % 4 === 3), study: items.filter((_, i) => i % 4 !== 3) };
}

const SYSTEM = `You tidy test questions. The person pastes quiz or exam text in any layout (numbered lists, Q and A pairs, multiple choice with letters, tables, CSV). Reply with JSON only: {"questions":[{"question":"","answer":"","alternatives":["other ways to say the answer"],"options":["only for multiple choice, in order"],"topic":"","explanation":"only if the text gives one"}]}. Rules: keep every question's wording exactly as written, only fixing numbering and layout. Use the answer the text gives; if the text gives no answer for a question, leave that question out. For multiple choice, "answer" is the right option's letter or text. Never write an answer yourself. Never invent questions.`;

/** Splits long text at line breaks into pieces a small model can handle. */
export function chunks(source: string, size = CHUNK): string[] {
  const out: string[] = [];
  let current = '';
  for (const line of source.split('\n')) {
    if (current.length + line.length > size && current) { out.push(current); current = ''; }
    current += `${line}\n`;
  }
  if (current.trim()) out.push(current);
  return out;
}

/** Reads pasted questions into the standard form with the AI, a piece at a time. Returns what it found; the person reviews it. */
export async function normalizeQuestions(source: string, ask: Ask, topics: string[] = []): Promise<NormalizedQuestion[]> {
  const found: NormalizedQuestion[] = [];
  // With a list of topics (an exam outline) the AI files each question under one of them.
  const system = topics.length ? `${SYSTEM} Set "topic" to the one of these that fits best, exactly as written, or leave it out: ${topics.slice(0, 60).join('; ')}.` : SYSTEM;
  for (const piece of chunks(source)) {
    if (found.length >= MAX_QUESTIONS) break;
    found.push(...readNormalized(await ask(system, piece)));
  }
  return found.slice(0, MAX_QUESTIONS);
}
