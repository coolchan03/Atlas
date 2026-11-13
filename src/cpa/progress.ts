/**
 * Does the person understand a topic? Not "did they tick it", but how they answered distinct questions on it. A topic counts as
 * understood once at least five different questions have been tried and at least 80% of them were right the last time. Asking
 * the same question again and again cannot raise it. Pure, from the practice results.
 */
import type { Exercise, Progress } from '../study/exercises';

export const UNDERSTOOD_MIN_QUESTIONS = 5;
export const UNDERSTOOD_SHARE = 0.8;

export type Understanding = 'not-checked' | 'needs-work' | 'understood';
export interface Evidence { questions: number; rightLast: number; status: Understanding }

export function topicEvidence(exercises: Exercise[], progress: Record<string, Progress>, scope: { topic: string; projectId?: string }): Evidence {
  const { topic, projectId } = scope;
  const tried = exercises.filter((e) => e.topic === topic && (!projectId || !e.projectId || e.projectId === projectId) && (progress[e.id]?.attempts ?? 0) > 0);
  const rightLast = tried.filter((e) => progress[e.id]?.last === true).length;
  if (!tried.length) return { questions: 0, rightLast: 0, status: 'not-checked' };
  const understood = tried.length >= UNDERSTOOD_MIN_QUESTIONS && rightLast / tried.length >= UNDERSTOOD_SHARE;
  return { questions: tried.length, rightLast, status: understood ? 'understood' : 'needs-work' };
}

export const describeEvidence = (e: Evidence): string => {
  if (e.status === 'not-checked') return 'Not checked yet';
  const base = `${e.rightLast} of ${e.questions} right`;
  if (e.status === 'understood') return `Understood: ${base}`;
  return e.questions < UNDERSTOOD_MIN_QUESTIONS ? `${base}: try at least ${UNDERSTOOD_MIN_QUESTIONS} different questions` : `Needs work: ${base}`;
};
