import { beginWork, currentWork, endWork, giveUpReason, noteReading, noteWriting, workLine } from '../../../src/topics/liveWork';

const limits = { readMs: 180_000, stallMs: 120_000, overallMs: 600_000 };

describe('telling reading from writing, and slow from stuck', () => {
  let t = 0;
  afterEach(() => endWork(t));

  it('says what the AI is doing and keeps going while words keep coming, however long it takes', () => {
    t = beginWork(0);
    expect(currentWork().phase).toBe('waiting');
    noteReading(t, 1000);
    expect(workLine(currentWork(), 31_000)).toMatch(/Reading the sources \(30 s\)/);
    noteWriting(t, 'The', 100_000);
    noteWriting(t, 'The lease liability', 400_000);
    expect(workLine(currentWork(), 401_000)).toMatch(/Writing .*words so far/);
    expect(giveUpReason(currentWork(), 500_000, limits)).toBeNull(); // 8 minutes in, but words are still coming
  });

  it('stops a call that is stuck reading, stuck writing, or past the overall limit, and says which', () => {
    t = beginWork(0); noteReading(t, 0);
    expect(giveUpReason(currentWork(), 200_000, limits)?.why).toBe('reading');
    noteWriting(t, 'abc', 210_000);
    expect(giveUpReason(currentWork(), 215_000, limits)).toBeNull();
    expect(giveUpReason(currentWork(), 340_000, limits)?.why).toBe('stalled');
    noteWriting(t, 'abcdef', 590_000);
    expect(giveUpReason(currentWork(), 601_000, limits)?.message).toMatch(/still writing after 10 minutes/);
  });

  it('gives a call that reports no progress (a server) only the overall limit', () => {
    t = beginWork(0);
    expect(giveUpReason(currentWork(), 500_000, limits)).toBeNull();
    expect(giveUpReason(currentWork(), 700_000, limits)?.why).toBe('slow');
  });

  it('ignores a call that finished late, so it cannot end the record of the call after it', () => {
    const first = beginWork(0);
    const second = beginWork(1000);
    endWork(first);
    noteReading(second, 2000);
    expect(currentWork().phase).toBe('reading');
    noteWriting(first, 'late words', 3000);
    expect(currentWork().chars).toBe(0);
    t = second;
  });

  it('counts a stream of pieces and a stream of whole texts the same', () => {
    t = beginWork(0); noteReading(t, 0);
    ['The', ' answer', ' is'].forEach((p) => noteWriting(t, p, 10));
    expect(currentWork().chars).toBe(13);
    endWork(t);
    t = beginWork(0); noteReading(t, 0);
    ['The', 'The answer', 'The answer is'].forEach((p) => noteWriting(t, p, 10));
    expect(currentWork().chars).toBe(13);
  });
});
