/**
 * One lesson is written at a time, because the phone runs one model. A lesson someone is waiting for goes before one being prepared
 * ahead of time, and a lesson already queued or being written is never written twice: asking for it again returns the same result
 * (and moves it up if it was only being prepared). Pure of any screen or model.
 */
interface Job<T = unknown> {
  key: string;
  priority: number;
  run: () => Promise<T>;
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

const pending: Job[] = [];
const known = new Map<string, Job>();
let running = false;

function pump(): void {
  if (running || !pending.length) return;
  // Highest priority first; among equals, the one asked for first.
  let best = 0;
  pending.forEach((j, i) => { if (j.priority > pending[best].priority) best = i; });
  const [job] = pending.splice(best, 1);
  running = true;
  // The job is forgotten before its result is handed over, so asking for the same lesson again afterwards writes it again.
  const finish = (settle: () => void) => { known.delete(job.key); running = false; settle(); pump(); };
  job.run().then((v) => finish(() => job.resolve(v)), (e) => finish(() => job.reject(e)));
}

/** Queues work under a key. `priority` 1 is a lesson the person is waiting for; 0 is one prepared ahead. */
export function enqueue<T>(key: string, run: () => Promise<T>, priority: number): Promise<T> {
  const existing = known.get(key) as Job<T> | undefined;
  if (existing) { existing.priority = Math.max(existing.priority, priority); return existing.promise; }
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  const job: Job<T> = { key, priority, run, promise, resolve, reject };
  known.set(key, job as Job);
  pending.push(job as Job);
  pump();
  return promise;
}

/** True while anything is being written or waiting to be. */
export const busy = (): boolean => running || pending.length > 0;
/** True when a lesson someone is waiting for is queued or being written. */
export const personWaiting = (): boolean => [...known.values()].some((j) => j.priority > 0);
