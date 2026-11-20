/**
 * The Judge writes unfamiliar APPLICATION questions with hidden answer keys. The questions test whether a learned idea can be used on a new
 * case, not whether its wording can be repeated: a question that only restates a stored claim is dropped. The key is stored with the question
 * as an exam item. Exam items are never study questions and the learner never sees them, so the key stays hidden. The AI writes; plain code
 * validates every item, drops copies of the claims and repeats, and builds the key the exam scores against.
 */
import { similarity } from './claimText';
import { readNormalized, toExpected, withoutRepeats, type NormalizedQuestion } from './questionImport';
import type { Expected } from './exams';

/** A question this close to a claim's own wording only asks for the claim back. */
const TOO_FAMILIAR = 0.6;
export const MAX_APPLICATION_QUESTIONS = 6;

/** The prompt: the claims the questions must be built on, and what a good application question is. */
export function applicationPrompt(topic: string, claims: string[]): { system: string; user: string } {
  return {
    system: 'You are a strict examiner. Reply with ONLY JSON.',
    user: `Topic: ${topic}\nIdeas the learner has stored:\n${claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nWrite up to ${MAX_APPLICATION_QUESTIONS} APPLICATION questions. Each describes a new situation (different names, numbers and setting from the ideas above) where one of the ideas must be used to decide or calculate something. Do not restate an idea and do not ask for a definition. Give the right answer as short facts.\nReply with ONLY JSON: {"questions":[{"question":"...","answer":"the right answer, one fact per line","alternatives":["another wording of the answer"],"topic":"..."}]}`,
  };
}

/** Questions from the Judge's reply that are really new: not a copy of a stored claim, not a repeat of an existing question. */
export function applicationQuestions(reply: string, claims: string[], existing: string[]): { kept: NormalizedQuestion[]; familiar: number; repeats: number } {
  const written = readNormalized(reply).slice(0, MAX_APPLICATION_QUESTIONS * 2);
  const fresh = written.filter((q) => !claims.some((c) => similarity(q.question, c) >= TOO_FAMILIAR));
  const { kept, repeats } = withoutRepeats(fresh, existing);
  return { kept: kept.slice(0, MAX_APPLICATION_QUESTIONS), familiar: written.length - fresh.length, repeats };
}

export const keyFor = (q: NormalizedQuestion): Expected => toExpected(q);
