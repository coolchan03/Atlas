/**
 * Quiz answers you got wrong in a course go into Practice as questions due for review, so they come back after a day, three days,
 * a week and so on (the same spaced review every other question gets) until you answer them right. Pure apart from the store.
 */
import { useExerciseStore, type Exercise } from '../study/exercises';
import type { Course } from './store';
import type { PlannedSquare, SquareContent } from './formats';

/** Adds the missed questions of a quiz square to Practice and marks them due now. Returns how many were kept. */
export function keepMissed({ course, square, content, missed }: { course: Course; square: PlannedSquare; content: SquareContent; missed: number[] }): number {
  if (content.kind !== 'quiz') return 0;
  const set: Exercise[] = missed.map((i) => ({ q: content.questions[i], i })).filter((x) => !!x.q).map(({ q, i }) => ({
    id: `sq-${course.id}-${square.key}-${i}`, kind: 'mcq' as const, topic: square.title, projectId: course.projectId,
    prompt: q.q, choices: q.options, answer: q.answer, explain: q.why || undefined,
  }));
  if (!set.length) return 0;
  const store = useExerciseStore.getState();
  store.addSet(set);
  set.forEach((e) => store.record(e.id, false));
  return set.length;
}

/** How many saved questions are due for review now. */
export function dueCount(now = Date.now()): number {
  const { exercises, progress } = useExerciseStore.getState();
  return Object.values(exercises).filter((e) => { const p = progress[e.id]; return !!p && (p.last === false || p.due <= now) && p.attempts > 0; }).length;
}
