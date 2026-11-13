/**
 * One list of long-running work (imports, ZIP extraction, indexing, transcription, audio preparation, downloads, learning jobs).
 * It records what each job is doing so it can be seen, cancelled and retried in one place. It does not run the work itself:
 * the code that does the work reports to it and checks `isCancelled` at a safe point.
 *
 * Honest by design: progress is only a percentage when the total is known; a job that was running when Android ended the app is
 * shown as interrupted (never as still running); failed jobs stay until the person dismisses them.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localUniqueId } from '../utils/uniqueId';

export type TaskType = 'import' | 'zip' | 'index' | 'transcribe' | 'audio' | 'download' | 'learning' | 'other';
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';
export interface Task {
  id: string; type: TaskType; title: string;
  /** Shown instead of a private project or chat name when that item is protected. */
  scopeLabel?: string; protectedScope?: boolean;
  status: TaskStatus; stage?: string;
  /** Only when the total is known; otherwise the screen shows the stage and no percentage. */
  completed?: number; total?: number;
  /** Where to continue from, set by the work when it reaches a safe point. */
  checkpoint?: string;
  error?: string; retryable?: boolean;
  startedAt: number; updatedAt: number;
  cancelRequested?: boolean;
}

/** Jobs that need a lot of memory never run together. Other types may run alongside one of these. */
export const HEAVY_TYPES: TaskType[] = ['zip', 'index', 'audio', 'transcribe'];
export const MAX_HEAVY_AT_ONCE = 1;
const ACTIVE: TaskStatus[] = ['queued', 'running'];

interface State {
  tasks: Task[];
  start: (t: { type: TaskType; title: string; scopeLabel?: string; protectedScope?: boolean; retryable?: boolean }) => string;
  update: (id: string, patch: Partial<Pick<Task, 'stage' | 'completed' | 'total' | 'checkpoint'>>) => void;
  finish: (id: string) => void;
  fail: (id: string, error: string, retryable?: boolean) => void;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
  /** Called when the app starts: anything still marked running was cut off by the system. */
  markInterrupted: () => void;
  /** Runs a failed or cancelled job again, but only while the code that started it is still alive (see `trackTask`); false otherwise. */
  retry: (id: string) => boolean;
}

export const progressPercent = (t: Pick<Task, 'completed' | 'total'>): number | null =>
  typeof t.total === 'number' && t.total > 0 && typeof t.completed === 'number' ? Math.min(100, Math.round((t.completed / t.total) * 100)) : null;

/** The title to show: a protected project's name is never shown, in the list or in a notification. */
export const displayTitle = (t: Pick<Task, 'title' | 'protectedScope'>): string => (t.protectedScope ? 'Protected item' : t.title);

/** Whether a new job of this type may start now; heavy ones wait while another heavy one is running. */
export function canStartNow(tasks: Task[], type: TaskType): boolean {
  if (!HEAVY_TYPES.includes(type)) return true;
  return tasks.filter((t) => t.status === 'running' && HEAVY_TYPES.includes(t.type)).length < MAX_HEAVY_AT_ONCE;
}

export const isActive = (t: Task): boolean => ACTIVE.includes(t.status);
const touch = (t: Task, patch: Partial<Task>): Task => ({ ...t, ...patch, updatedAt: Date.now() });

/** Work that can be run again, by task id. Lives in memory only: after the app is killed a job has to be started again by the person. */
const runners = new Map<string, () => void>();

export const useTasks = create<State>()(persist((set, get) => ({
  tasks: [],
  start: (t) => {
    const id = localUniqueId('task');
    const now = Date.now();
    const status: TaskStatus = canStartNow(get().tasks, t.type) ? 'running' : 'queued';
    set((s) => ({ tasks: [{ id, ...t, status, startedAt: now, updatedAt: now }, ...s.tasks] }));
    return id;
  },
  update: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id && isActive(t) ? touch(t, patch) : t)) })),
  finish: (id) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id && isActive(t) ? touch(t, { status: 'done', stage: undefined, ...(t.total ? { completed: t.total } : {}) }) : t)) })),
  fail: (id, error, retryable = false) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? touch(t, { status: 'failed', error: error.slice(0, 300), retryable }) : t)) })),
  cancel: (id) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id && isActive(t) ? touch(t, { cancelRequested: true, status: t.status === 'queued' ? 'cancelled' : t.status }) : t)) })),
  dismiss: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id || isActive(t)) })), // a running job cannot be hidden
  markInterrupted: () => set((s) => ({ tasks: s.tasks.map((t) => (isActive(t) ? touch(t, { status: 'interrupted', error: 'Android ended Atlas while this was running. Start it again from where you began it: items already added are kept and not duplicated.', retryable: false }) : t)) })),
  retry: (id) => {
    const t = get().tasks.find((x) => x.id === id);
    const rerun = runners.get(id);
    if (!t || !rerun || !['failed', 'cancelled'].includes(t.status)) return false;
    set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? touch(x, { status: canStartNow(s.tasks, x.type) ? 'running' : 'queued', error: undefined, cancelRequested: false }) : x)) }));
    rerun();
    return true;
  },
}), { name: 'atlas-tasks', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ tasks: s.tasks.slice(0, 100) }) }));

/** Safe boundary check for the work: true once the person asked to cancel, so it can stop and clean up. */
export const isCancelled = (id: string): boolean => !!useTasks.getState().tasks.find((t) => t.id === id)?.cancelRequested;

type Control = { id: string; progress: (p: { stage?: string; completed?: number; total?: number; checkpoint?: string }) => void; cancelled: () => boolean };

/**
 * Runs `work` as a tracked job. The work reports progress and checks `cancelled()`; a throw becomes a failed job. When `retryable`,
 * Retry runs the same work again while the app is alive. A cancelled job is never marked done.
 */
export async function trackTask<T>(
  meta: { type: TaskType; title: string; scopeLabel?: string; protectedScope?: boolean; retryable?: boolean },
  work: (ctl: Control) => Promise<T>,
): Promise<T | undefined> {
  const id = useTasks.getState().start(meta);
  const ctl: Control = { id, progress: (p) => useTasks.getState().update(id, p), cancelled: () => isCancelled(id) };
  const run = async (): Promise<T | undefined> => {
    try {
      const result = await work(ctl);
      if (isCancelled(id)) { useTasks.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? touch(t, { status: 'cancelled' }) : t)) })); return undefined; }
      useTasks.getState().finish(id); runners.delete(id);
      return result;
    } catch (e) {
      useTasks.getState().fail(id, String((e as Error)?.message ?? e), !!meta.retryable);
      throw e;
    }
  };
  if (meta.retryable) runners.set(id, () => { void run().catch(() => undefined); });
  return run();
}
