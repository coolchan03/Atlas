import { busy, cancel, enqueue, phaseOf } from '../../../src/topics/generationQueue';

const never = () => new Promise<never>(() => undefined);
const tick = () => new Promise((r) => setImmediate(r));

describe('lesson queue limits', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('abandons a job that hangs, stops the model, and lets the next job run', async () => {
    jest.useFakeTimers();
    const onAbort = jest.fn();
    const hung = enqueue('hung', never, 1, { limitMs: 1000, onAbort });
    const next = enqueue('next', async () => 'ok', 0);
    const hungResult = hung.catch((e: Error) => e.message);
    expect(phaseOf('hung')).toBe('writing');
    expect(phaseOf('next')).toBe('waiting');
    await jest.advanceTimersByTimeAsync(1001);
    expect(await hungResult).toMatch(/took too long/);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(await next).toBe('ok');
    expect(busy()).toBe(false);
  });

  it('ignores a late result from an abandoned job (the slot is released only once)', async () => {
    jest.useFakeTimers();
    let finish!: (v: string) => void;
    const slow = enqueue('slow', () => new Promise<string>((r) => { finish = r; }), 1, { limitMs: 500 });
    const slowResult = slow.catch(() => 'timed out');
    const second = enqueue('second', () => new Promise<string>((r) => setTimeout(() => r('second'), 2000)), 1);
    await jest.advanceTimersByTimeAsync(501);
    expect(await slowResult).toBe('timed out');
    expect(phaseOf('second')).toBe('writing');
    finish('late'); // must not free the slot while "second" is running
    await jest.advanceTimersByTimeAsync(10);
    expect(phaseOf('second')).toBe('writing');
    await jest.advanceTimersByTimeAsync(2000);
    expect(await second).toBe('second');
    expect(busy()).toBe(false);
  });

  it('cancels a queued job without running it, and a running job by stopping the model', async () => {
    jest.useRealTimers();
    const onAbort = jest.fn();
    const ran = jest.fn();
    const running = enqueue('running', never, 1, { limitMs: 60_000, onAbort });
    const queued = enqueue('queued', async () => { ran(); return 1; }, 0);
    const r1 = running.catch((e: Error) => e.message);
    const r2 = queued.catch((e: Error) => e.message);
    expect(cancel('queued', 'Stopped by you.')).toBe(true);
    expect(await r2).toBe('Stopped by you.');
    expect(onAbort).not.toHaveBeenCalled();
    expect(cancel('running')).toBe(true);
    expect(await r1).toBe('Stopped.');
    expect(onAbort).toHaveBeenCalled();
    await tick();
    expect(ran).not.toHaveBeenCalled();
    expect(busy()).toBe(false);
    expect(cancel('nothing')).toBe(false);
  });

  it('a rejected job releases the queue, and asking again writes it again', async () => {
    await expect(enqueue('bad', async () => { throw new Error('boom'); }, 1)).rejects.toThrow('boom');
    expect(busy()).toBe(false);
    await expect(enqueue('bad', async () => 'fine', 1)).resolves.toBe('fine');
  });

  it('shares one job for the same key and raises its priority', async () => {
    const run = jest.fn(async () => 'x');
    const a = enqueue('same', run, 0);
    const b = enqueue('same', run, 1);
    expect(a).toBe(b);
    await a;
    expect(run).toHaveBeenCalledTimes(1);
  });
});
