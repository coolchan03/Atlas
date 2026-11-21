/** A timed practice exam: a fixed set of questions, no feedback until the end, then a score by topic. */
import { check, practiceSet, type Exercise, type Progress } from './exercises';

export interface Exam { ids: string[]; minutes: number; startedAt: number }
export interface ExamResult { correct: number; total: number; unanswered: number; percent: number; byTopic: Array<{ topic: string; correct: number; total: number }>; wrong: string[];
  /** When the time spent on each question was recorded: the average, and the topics that took longest per question. */
  pace?: { averageSeconds: number; slowest: Array<{ topic: string; seconds: number }> } }

/** Picks `count` questions across all topics (due and missed first) and starts the clock. */
export function buildExam(exercises: Exercise[], progress: Record<string, Progress>, opts: { count: number; minutes: number; now?: number }): Exam {
  const set = practiceSet(exercises, progress, { count: opts.count, now: opts.now });
  return { ids: set.map((e) => e.id), minutes: opts.minutes, startedAt: opts.now ?? Date.now() };
}

/** A mock exam of `count` questions spread evenly across topics (missed and due first within each), 90 seconds a question. */
export function buildMockExam(exercises: Exercise[], progress: Record<string, Progress>, opts: { count: number; now?: number }): Exam {
  const byTopic = new Map<string, Exercise[]>();
  for (const e of exercises) byTopic.set(e.topic ?? 'General', [...(byTopic.get(e.topic ?? 'General') ?? []), e]);
  const queues = [...byTopic.values()].map((list) => practiceSet(list, progress, { count: list.length, now: opts.now }));
  const ids: string[] = [];
  for (let round = 0; ids.length < opts.count && queues.some((q) => q[round]); round++) {
    for (const q of queues) if (q[round] && ids.length < opts.count) ids.push(q[round].id);
  }
  return { ids, minutes: Math.max(1, Math.ceil(ids.length * 1.5)), startedAt: opts.now ?? Date.now() };
}

export const secondsLeft = (exam: Exam, now: number): number => Math.max(0, Math.round(exam.minutes * 60 - (now - exam.startedAt) / 1000));

/** Grades the answers given so far. A question left blank counts as wrong and as unanswered. */
export function gradeExam(exam: Exam, exercises: Record<string, Exercise>, answers: Record<string, unknown>): ExamResult {
  const topics = new Map<string, { correct: number; total: number }>();
  const wrong: string[] = [];
  let correct = 0; let unanswered = 0;
  for (const id of exam.ids) {
    const ex = exercises[id]; if (!ex) continue;
    const given = answers[id];
    const blank = given === undefined || given === '' || (Array.isArray(given) && given.length === 0);
    if (blank) unanswered++;
    const ok = !blank && check(ex, given).correct;
    if (ok) correct++; else wrong.push(id);
    const t = topics.get(ex.topic ?? 'General') ?? { correct: 0, total: 0 };
    topics.set(ex.topic ?? 'General', { correct: t.correct + (ok ? 1 : 0), total: t.total + 1 });
  }
  const total = exam.ids.length;
  return { correct, total, unanswered, percent: total ? Math.round((correct / total) * 100) : 0, byTopic: [...topics].map(([topic, v]) => ({ topic, ...v })).sort((a, b) => a.correct / a.total - b.correct / b.total), wrong };
}

/** How long the answers took: the average, and the topics that took longest per question (from the seconds spent on each question). */
export function paceOf(exam: Exam, exercises: Record<string, Exercise>, times: Record<string, number>): ExamResult['pace'] | undefined {
  const perTopic = new Map<string, number[]>();
  for (const id of exam.ids) {
    const e = exercises[id];
    if (e && times[id] !== undefined) perTopic.set(e.topic ?? 'General', [...(perTopic.get(e.topic ?? 'General') ?? []), times[id]]);
  }
  const all = [...perTopic.values()].flat();
  if (!all.length) return undefined;
  return {
    averageSeconds: Math.round(all.reduce((a, b) => a + b, 0) / all.length),
    slowest: [...perTopic].map(([topic, v]) => ({ topic, seconds: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((a, b) => b.seconds - a.seconds).slice(0, 3),
  };
}
