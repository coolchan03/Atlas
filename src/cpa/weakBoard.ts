/**
 * A review board built from the topics you are weakest in: for each one a lesson that explains it again, then its quiz, assignment and chapter
 * exam, and a review exam at the end. Weak means practice questions were tried and fewer than the "understood" share were right (a topic
 * with no practice yet is not weak, it is unchecked). Pure; the board itself is made by the caller.
 */
import { UNDERSTOOD_SHARE, topicEvidence } from './progress';
import { chapterSquares } from '../topics/chapterSequence';
import type { CoursePlan, PlannedSquare } from '../topics/formats';
import type { Exercise, Progress } from '../study/exercises';
import type { CpaTopic } from './store';

export interface WeakTopic { topic: CpaTopic; rightLast: number; questions: number }

/** The weakest topics first, at most `limit`. */
export function weakTopics(args: { topics: CpaTopic[]; exercises: Exercise[]; progress: Record<string, Progress>; projectId?: string; examCode: string; limit?: number }): WeakTopic[] {
  const { topics, exercises, progress, projectId, examCode, limit = 4 } = args;
  return topics
    .map((topic) => ({ topic, e: topicEvidence(exercises, progress, { topic: topic.name, projectId, examCode }) }))
    // Weak is a poor result, not just "too few questions yet": a topic right 4 of 4 is not weak, only not enough practice to call it understood.
    .filter((x) => x.e.status === 'needs-work' && x.e.rightLast / x.e.questions < UNDERSTOOD_SHARE)
    .sort((a, b) => a.e.rightLast / a.e.questions - b.e.rightLast / b.e.questions)
    .slice(0, limit)
    .map((x) => ({ topic: x.topic, rightLast: x.e.rightLast, questions: x.e.questions }));
}

export function weakBoardPlan(label: string, weak: WeakTopic[]): CoursePlan {
  const squares: PlannedSquare[] = [];
  for (const w of weak) {
    for (const sq of chapterSquares(w.topic.name, w.topic.area, `for ${label}: you got ${w.rightLast} of ${w.questions} right, so go back over it`)) {
      squares.push({ key: `s${squares.length + 1}`, ...sq, ...(sq.format === 'lesson' ? { remedial: true } : {}) });
    }
  }
  squares.push({ key: `s${squares.length + 1}`, format: 'quiz', title: 'Review exam', focus: `Mixed questions on ${weak.map((w) => w.topic.name).join(', ')}`, unit: 'Review', checkpoint: true });
  return { title: `${label}: weak spots`, summary: `The topics you are weakest in: ${weak.map((w) => w.topic.name).join(', ')}.`, style: 'Explain it again differently, then check it with a quiz.', theme: 'review', squares };
}
