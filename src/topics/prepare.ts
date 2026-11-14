import { create } from 'zustand';
import { personWaiting } from './generationQueue';
import { squareContent } from './service';
import { useTopics, type Course } from './store';

/**
 * Writing the next lessons while you play, so opening one does not mean waiting for the AI. Lessons are written one at a time in the
 * background (a lesson you open yourself always goes first), and a failure just stops it quietly: the lesson is then written when
 * you open it, as before.
 */
export const DEFAULT_AHEAD = 2;
export const AHEAD_CHOICES = [0, 1, 2, 3, 5];
/** Squares the app makes itself, instantly and with no AI: nothing to write ahead. */
const MADE_IN_CODE = ['drill', 'periodic'];

interface PrepareState { courseId: string; working: string; ready: number; total: number; error: string }
export const usePrepare = create<PrepareState>(() => ({ courseId: '', working: '', ready: 0, total: 0, error: '' }));

export const aheadFor = (course: Course): number => course.prepareAhead ?? DEFAULT_AHEAD;

/**
 * The next squares to write: the window is the first `count` squares not played yet (leaving out those the app makes in code), and
 * what is returned is the ones in that window that have no lesson yet. A window, not "the next few missing": once the window is
 * written there is nothing more to do until a square is played and it moves on.
 */
export function nextToPrepare(course: Course, count: number): string[] {
  const window = course.squares.filter((s) => !course.progress[s.key] && !MADE_IN_CODE.includes(s.format)).slice(0, Math.max(0, count));
  return window.filter((s) => !course.content[s.key]).map((s) => s.key);
}

let running = false;

/** Starts writing the next lessons of a course (if it is not already), one after another. Safe to call whenever the board or progress changes. */
export async function prepareAhead(courseId: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const course = useTopics.getState().courses.find((c) => c.id === courseId);
      if (!course) break;
      const wanted = aheadFor(course);
      const todo = nextToPrepare(course, wanted);
      if (!todo.length) { usePrepare.setState({ courseId, working: '', ready: wanted, total: wanted, error: '' }); break; }
      // A lesson someone is waiting for is being written: let it finish before starting another one in the background.
      if (personWaiting()) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      usePrepare.setState({ courseId, working: todo[0], ready: wanted - todo.length, total: wanted, error: '' });
      try { await squareContent(course, todo[0], { background: true }); }
      catch (e) { usePrepare.setState({ working: '', error: String((e as Error)?.message || e) }); break; }
    }
  } finally {
    running = false;
    if (usePrepare.getState().working) usePrepare.setState({ working: '' });
  }
}
