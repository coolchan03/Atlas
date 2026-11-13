/**
 * Short study sessions (5, 10 or 20 minutes): a set of questions that fits the time, due and missed ones first, then new ones.
 * Pure, so it is tested without a screen. Only the questions passed in are used, so the caller scopes them to one exam or project.
 */
import { practiceSet, type Exercise, type Progress } from './exercises';

/** About how long each kind of question takes, in seconds. */
export const SECONDS_BY_KIND: Record<Exercise['kind'], number> = {
  mcq: 45, truefalse: 25, fill: 40, calc: 120, order: 60, match: 75, table: 180, short: 90, testlet: 240,
};
export const SESSION_MINUTES = [5, 10, 20] as const;

export interface Session { set: Exercise[]; estimateMinutes: number }

/** What to start and what to tell the person. With no questions there is nothing to score, so no quiz is invented. */
export function planSession(exercises: Exercise[], progress: Record<string, Progress>, minutes: number): { set: Exercise[]; note: string } {
  if (!exercises.length) return { set: [], note: 'No questions yet, so there is nothing to score. Make some from your documents, or try flashcards.' };
  const s = sessionSet(exercises, progress, minutes);
  return { set: s.set, note: `${s.set.length} question${s.set.length === 1 ? '' : 's'}, about ${s.estimateMinutes} min. Stop any time: your answers so far are kept.` };
}

/** Questions for a session of `minutes`. Never empty when there is anything to ask, and never longer than the time allows (after the first question). */
export function sessionSet(exercises: Exercise[], progress: Record<string, Progress>, minutes: number): Session {
  const now = Date.now();
  const budget = Math.max(1, minutes) * 60;
  const ranked = practiceSet(exercises, progress, { count: exercises.length, now });
  const set: Exercise[] = [];
  let used = 0;
  for (const ex of ranked) {
    const cost = SECONDS_BY_KIND[ex.kind] ?? 60;
    if (set.length > 0 && used + cost > budget) continue; // a shorter question later may still fit
    set.push(ex);
    used += cost;
    if (used >= budget) break;
  }
  return { set, estimateMinutes: Math.max(1, Math.round(used / 60)) };
}
