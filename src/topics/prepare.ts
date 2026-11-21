import { create } from 'zustand';
import { personWaiting } from './generationQueue';
import { squareContent } from './service';
import { useTopics, type Course } from './store';

/**
 * Writing the next lessons while you play, so opening one does not mean waiting for the AI. Lessons are written one at a time in the
 * background (a lesson you open yourself always goes first), and a failure just stops it quietly: the lesson is then written when
 * you open it, as before.
 */
const DEFAULT_AHEAD = 2;
export const AHEAD_CHOICES = [0, 1, 2, 3, 5, 8, 10, 15, 20];
/** Squares the app makes itself, instantly and with no AI: nothing to write ahead. */
const MADE_IN_CODE = ['drill', 'periodic'];

interface PrepareState { courseId: string; working: string; ready: number; total: number; error: string }
export const usePrepare = create<PrepareState>(() => ({ courseId: '', working: '', ready: 0, total: 0, error: '' }));

export const aheadFor = (course: Course): number => course.prepareAhead ?? DEFAULT_AHEAD;

/**
 * The next squares to write: the window is the first `count` squares not played yet (leaving out those the app makes in code), and
 * what is returned is the ones in that window that have no lesson yet. A window, not "the next few missing": once the window is
 * written there is nothing more to do until a square is played and it moves on.
 * @public Reached by name through require() (tests, other modules): the export is used.
 */
export function nextToPrepare(course: Course, count: number): string[] {
  const window = course.squares.filter((s) => !course.progress[s.key] && !MADE_IN_CODE.includes(s.format)).slice(0, Math.max(0, count));
  return window.filter((s) => !course.content[s.key]).map((s) => s.key);
}

let running = false;
let batchRunning = false;
/** True while the ahead writer has a lesson in the queue, so "write now" can wait for it instead of sharing the model with it. */
let aheadWriting = false;

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
      // A lesson someone is waiting for, or a "write now" batch, is being written: one writer at a time, so the screen has one count and one list.
      if (personWaiting() || batchRunning) { usePrepare.setState({ working: '' }); await new Promise((r) => setTimeout(r, 1000)); continue; }
      usePrepare.setState({ courseId, working: todo[0], ready: wanted - todo.length, total: wanted, error: '' });
      aheadWriting = true;
      try { await squareContent(course, todo[0], { background: true }); }
      catch (e) { usePrepare.setState({ working: '', error: String((e as Error)?.message || e) }); break; }
      finally { aheadWriting = false; }
    }
  } finally {
    running = false;
    if (usePrepare.getState().working) usePrepare.setState({ working: '' });
  }
}

// ------------------------------------------------------------------ write now
/** The squares of a course still to be written (not played, not made in code, no content yet), in board order. */
const missing = (course: Course): string[] => course.squares.filter((s) => !course.content[s.key] && !MADE_IN_CODE.includes(s.format)).map((s) => s.key);

/** Every square of one chapter (unit) that still needs writing. */
export function missingInUnit(course: Course, unit: string): string[] {
  const todo = new Set(missing(course));
  return course.squares.filter((s) => s.unit === unit && todo.has(s.key)).map((s) => s.key);
}

/** Every square of the course that still needs writing. */
export const missingAll = (course: Course): string[] => missing(course);

/** The chapters of a course, in board order, with how many squares each has and how many are written. */
export function unitsOf(course: Course): Array<{ unit: string; total: number; written: number }> {
  const out: Array<{ unit: string; total: number; written: number }> = [];
  for (const s of course.squares) {
    if (MADE_IN_CODE.includes(s.format)) continue;
    let u = out.find((x) => x.unit === s.unit);
    if (!u) { u = { unit: s.unit, total: 0, written: 0 }; out.push(u); }
    u.total += 1;
    if (course.content[s.key]) u.written += 1;
  }
  return out;
}

interface BatchState { courseId: string; label: string; total: number; done: number; working: string; failed: string[] }
/** What "write now" is doing, for the board: which square, how many are done, and which ones failed (and why the first one did). */
export const useBatch = create<BatchState & { error: string }>(() => ({ courseId: '', label: '', total: 0, done: 0, working: '', failed: [], error: '' }));

let batchCancelled = false;

/** Stops "write now" after the square being written is stopped: nothing more is started, and what is already written stays. */
export function cancelWriteNow(): void {
  if (!batchRunning) return;
  batchCancelled = true;
  const { courseId, working } = useBatch.getState();
  if (working) { try { require('./service').stopWriting(courseId, working); } catch { /* it finishes on its own */ } }
}

/**
 * Writes the given squares one after another, now (not when the person reaches them). A square that fails is tried once more and then
 * skipped, so one bad answer from the model does not stop the rest; the failures are listed when it finishes. Returns how many were written.
 */
export async function writeNow(courseId: string, keys: string[], label: string): Promise<number> {
  if (batchRunning || !keys.length) return 0;
  batchRunning = true;
  while (aheadWriting) await new Promise((r) => setTimeout(r, 500)); // the lesson being written ahead finishes first: one writer at a time
  batchCancelled = false;
  useBatch.setState({ courseId, label, total: keys.length, done: 0, working: '', failed: [], error: '' });
  let written = 0;
  try {
    for (const key of keys) {
      if (batchCancelled) break;
      const course = useTopics.getState().courses.find((c) => c.id === courseId);
      if (!course) break;
      if (course.content[key]) { useBatch.setState((s) => ({ done: s.done + 1 })); continue; }
      // A square someone is waiting for goes first.
      while (personWaiting()) await new Promise((r) => setTimeout(r, 1000));
      useBatch.setState({ working: key });
      let ok = false;
      let reason = '';
      for (let attempt = 0; attempt < 2 && !ok && !batchCancelled; attempt++) {
        try { await squareContent(useTopics.getState().courses.find((c) => c.id === courseId) ?? course, key, { background: true }); ok = true; }
        catch (e) { reason = String((e as Error)?.message || e); }
      }
      if (batchCancelled) break;
      if (ok) written += 1; else useBatch.setState((s) => ({ failed: [...s.failed, key], error: s.error || reason }));
      useBatch.setState((s) => ({ done: s.done + 1 }));
    }
  } finally {
    batchRunning = false;
    useBatch.setState({ working: '' });
  }
  return written;
}
