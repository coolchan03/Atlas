import { beginWork, currentWork, endWork, giveUpReason, noteReading, noteWriting, workLine } from '../../../src/topics/liveWork';

const limits = { readMs: 180_000, stallMs: 120_000, overallMs: 600_000 };

describe('telling reading from writing, and slow from stuck', () => {
  afterEach(() => endWork());

  it('says what the AI is doing and keeps going while words keep coming, however long it takes', () => {
    beginWork(0);
    expect(currentWork().phase).toBe('waiting');
    noteReading(1000);
    expect(workLine(currentWork(), 31_000)).toMatch(/Reading the sources \(30 s\)/);
    noteWriting('The', 100_000);
    noteWriting('The lease liability', 400_000);
    expect(workLine(currentWork(), 401_000)).toMatch(/Writing .*words so far/);
    expect(giveUpReason(currentWork(), 500_000, limits)).toBeNull(); // 8 minutes in, but words are still coming
  });

  it('stops a call that is stuck reading, stuck writing, or past the overall limit, and says which', () => {
    beginWork(0); noteReading(0);
    expect(giveUpReason(currentWork(), 200_000, limits)?.why).toBe('reading');
    noteWriting('abc', 210_000);
    expect(giveUpReason(currentWork(), 215_000, limits)).toBeNull();
    expect(giveUpReason(currentWork(), 340_000, limits)?.why).toBe('stalled');
    noteWriting('abcdef', 590_000);
    expect(giveUpReason(currentWork(), 601_000, limits)?.message).toMatch(/still writing after 10 minutes/);
  });

  it('gives a call that reports no progress (a server) only the overall limit', () => {
    beginWork(0);
    expect(giveUpReason(currentWork(), 500_000, limits)).toBeNull();
    expect(giveUpReason(currentWork(), 700_000, limits)?.why).toBe('slow');
  });
});
