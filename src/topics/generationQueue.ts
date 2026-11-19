/**
 * One lesson is written at a time, because the phone runs one model. A lesson someone is waiting for goes before one being prepared
 * ahead of time, and a lesson already queued or being written is never written twice: asking for it again returns the same result
 * (and moves it up if it was only being prepared). Pure of any screen or model.
 *
 * Work is bounded: a job that runs longer than its limit is abandoned (its `onAbort` stops the model) and the next job starts, and a job
 * can be cancelled while queued or running. A late result from an abandoned job is ignored, so it can never release the slot twice.
 */
export const DEFAULT_JOB_LIMIT_MS = 8 * 60 * 1000;

export type JobPhase = 'waiting' | 'writing';
interface Job<T = unknown> {
  key: string;
  priority: number;
  run: () => Promise<T>;
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  limitMs: number;
  onAbort?: () => void;
  phase: JobPhase;
  settled: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const pending: Job[] = [];
const known = new Map<string, Job>();
const listeners = new Set<() => void>();
let current: Job | null = null;

const changed = () => listeners.forEach((l) => { try { l(); } catch { /* a listener must not stop the queue */ } });
/** Calls `listener` whenever a job is queued, starts, or ends. Returns the way to stop listening. */
export function subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Where a lesson is: waiting in the queue, being written, or not in the queue at all. */
export function phaseOf(key: string): JobPhase | undefined { return known.get(key)?.phase; }

function settle(job: Job, how: () => void): void {
  if (job.settled) return;
  job.settled = true;
  if (job.timer) clearTimeout(job.timer);
  known.delete(job.key);
  if (current === job) current = null;
  how();
  changed();
  pump();
}

function pump(): void {
  if (current || !pending.length) return;
  // Highest priority first; among equals, the one asked for first.
  let best = 0;
  pending.forEach((j, i) => { if (j.priority > pending[best].priority) best = i; });
  const [job] = pending.splice(best, 1);
  current = job;
  job.phase = 'writing';
  // The job is forgotten before its result is handed over, so asking for the same lesson again afterwards writes it again.
  if (job.limitMs > 0 && Number.isFinite(job.limitMs)) {
    job.timer = setTimeout(() => {
      if (job.settled) return;
      try { job.onAbort?.(); } catch { /* the model may already be idle */ }
      settle(job, () => job.reject(new Error('This took too long and was stopped. Try again, or use a smaller model.')));
    }, job.limitMs);
    (job.timer as { unref?: () => void }).unref?.();
  }
  changed();
  let started: Promise<unknown>;
  try { started = job.run(); } catch (e) { started = Promise.reject(e); }
  started.then((v) => settle(job, () => job.resolve(v)), (e) => settle(job, () => job.reject(e)));
}

/** Queues work under a key. `priority` 1 is a lesson the person is waiting for; 0 is one prepared ahead. */
export function enqueue<T>(key: string, run: () => Promise<T>, priority: number, opts: { limitMs?: number; onAbort?: () => void } = {}): Promise<T> {
  const existing = known.get(key) as Job<T> | undefined;
  if (existing) { existing.priority = Math.max(existing.priority, priority); return existing.promise; }
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  const job: Job<T> = { key, priority, run, promise, resolve, reject, limitMs: opts.limitMs ?? DEFAULT_JOB_LIMIT_MS, onAbort: opts.onAbort, phase: 'waiting', settled: false };
  known.set(key, job as Job);
  pending.push(job as Job);
  changed();
  pump();
  return promise;
}

/** Stops work under a key: a queued one is dropped, a running one is abandoned (and its model stopped). Returns false when nothing was queued under it. */
export function cancel(key: string, reason = 'Stopped.'): boolean {
  const job = known.get(key);
  if (!job) return false;
  const at = pending.indexOf(job);
  if (at >= 0) pending.splice(at, 1);
  else { try { job.onAbort?.(); } catch { /* already idle */ } }
  settle(job, () => job.reject(new Error(reason)));
  return true;
}

/** True while anything is being written or waiting to be. */
export const busy = (): boolean => current !== null || pending.length > 0;
/** True when a lesson someone is waiting for is queued or being written. */
export const personWaiting = (): boolean => [...known.values()].some((j) => j.priority > 0);
