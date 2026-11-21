/**
 * A question bank or quiz, once read into standard questions, becomes practice questions for one exam: multiple choice stays
 * multiple choice, a number is a number (checked to the cent), true or false is true or false, anything else is checked
 * against the key terms of the answer. Each is filed under a topic of the exam's checklist. Pure apart from the final store write.
 */
import { similarity } from '../learning/claimText';
import { useExerciseStore, type Exercise } from '../study/exercises';
import type { NormalizedQuestion } from '../learning/questionImport';

const GENERAL = 'General';
const SAME_QUESTION = 0.8;

/** The checklist topic a question belongs to: the one the AI named if it is on the list, else the closest by wording, else General. */
export function topicFor(item: NormalizedQuestion, topics: string[]): string {
  const named = topics.find((t) => t.toLowerCase() === (item.topic ?? '').toLowerCase());
  if (named) return named;
  let best = GENERAL; let score = 0.3;
  for (const t of topics) { const s = similarity(`${item.question} ${item.topic ?? ''}`, t); if (s > score) { score = s; best = t; } }
  return best;
}

const asNumber = (answer: string): number | null => {
  const m = answer.trim().match(/^\(?(-?)\$?\s?(\d[\d,]*(?:\.\d+)?)\)?\s?%?$/);
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, ''));
  return answer.trim().startsWith('(') || m[1] ? -value : value;
};

/** Where a question belongs: a project, an exam code, or both. A plain string is a project id. */
export type QuestionScope = string | { projectId?: string; examCode?: string } | undefined;
const scopeOf = (scope: QuestionScope): { projectId?: string; examCode?: string } => (typeof scope === 'string' ? { projectId: scope } : scope ?? {});

export function toExercise(item: NormalizedQuestion, scopeIn: QuestionScope, topic: string): Exercise {
  const { projectId, examCode } = scopeOf(scopeIn);
  // The exam code is part of the identity: the same question text in FAR and AUD is two questions, never one overwriting the other.
  const base = { id: `own:${examCode ?? projectId ?? 'bank'}:${Math.abs(hash(item.question))}`, topic, ...(projectId ? { projectId } : {}), ...(examCode ? { examCode } : {}), prompt: item.question, explain: item.explain };
  if (item.options && item.options.length >= 2) {
    const index = item.options.findIndex((o) => similarity(o, item.answer) >= 0.9);
    return { ...base, kind: 'mcq', choices: item.options, answer: Math.max(0, index) };
  }
  const answer = item.answer.trim();
  if (/^(true|false)$/i.test(answer)) return { ...base, kind: 'truefalse', answer: /^true$/i.test(answer) };
  const number = asNumber(answer);
  if (number !== null) return { ...base, kind: 'calc', answer: number, tolerance: Math.max(0.01, Math.abs(number) * 0.001) };
  const terms = [answer, ...item.alternatives].flatMap((a) => a.split(/\n|;/)).map((t) => t.trim()).filter(Boolean);
  return { ...base, kind: 'short', keyTerms: terms.slice(0, 6), minTerms: 1 };
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; // eslint-disable-line no-bitwise
  return h;
}

export interface ImportSummary { added: number; repeats: number; byTopic: Record<string, number> }

/** Adds the questions to the practice bank of one exam. Questions already there (the same or nearly the same) are skipped. */
export function addToPractice(items: NormalizedQuestion[], scope: QuestionScope, topics: string[]): ImportSummary {
  const { projectId, examCode } = scopeOf(scope);
  const store = useExerciseStore.getState();
  const existing = Object.values(store.exercises).filter((e) => (examCode ? e.examCode === examCode : e.projectId === projectId)).map((e) => e.prompt);
  const fresh: Exercise[] = [];
  const byTopic: Record<string, number> = {};
  let repeats = 0;
  for (const item of items) {
    if (existing.some((q) => similarity(q, item.question) >= SAME_QUESTION)) { repeats++; continue; }
    existing.push(item.question);
    const topic = topicFor(item, topics);
    fresh.push(toExercise(item, { projectId, examCode }, topic));
    byTopic[topic] = (byTopic[topic] ?? 0) + 1;
  }
  if (fresh.length) store.addSet(fresh);
  return { added: fresh.length, repeats, byTopic };
}
