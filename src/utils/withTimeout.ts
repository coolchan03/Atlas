/** Thrown when something took longer than allowed. */
export class TimeoutError extends Error {
  constructor(public readonly what: string, public readonly ms: number) {
    super(`${what} took longer than ${Math.round(ms / 1000)} seconds and was stopped.`);
    this.name = 'TimeoutError';
  }
}

/**
 * Settles with `promise`, or rejects with a TimeoutError after `ms`. A promise itself cannot be cancelled from here, so pass
 * `{ what, onTimeout }` (for example `() => controller.abort()`) to tell the work to stop; work that honours an AbortSignal then really ends,
 * and anything that still finishes late must check the signal before it writes.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string | { what: string; onTimeout?: () => void }): Promise<T> {
  const { what, onTimeout } = typeof label === 'string' ? { what: label, onTimeout: undefined } : label;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { try { onTimeout?.(); } finally { reject(new TimeoutError(what, ms)); } }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
