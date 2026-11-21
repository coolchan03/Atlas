import { beginWork, currentWork, endWork, giveUpReason, noteReading, noteWriting, workLine } from '../../../src/topics/liveWork';

const limits = { readMs: 180_000, stallMs: 120_000, overallMs: 600_000 };

describe('telling reading from writing, and slow from stuck', () => {
  let t = 0;
  afterEach(() => endWork(t));

  it('says what the AI is doing and keeps going while words keep coming, however long it takes', () => {
    t = beginWork(0);
    expect(currentWork().phase).toBe('waiting');
    noteReading(t, 1000);
    expect(workLine(currentWork(), 31_000)).toMatch(/Reading the instructions and sources \(30 s so far\)/);
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

describe('the screen stays on while a lesson is written', () => {
  it('holds the screen for the whole job and lets go afterwards', async () => {
    jest.resetModules();
    const { screenAwakeReasons } = require('../../../src/atlasTools/runtimePower');
    const queue = require('../../../src/topics/generationQueue');
    let seen: string[] = [];
    await queue.enqueue('k', async () => { seen = screenAwakeReasons(); return 1; }, 1);
    expect(seen).toContain('lesson-writing');
    await new Promise((r) => setTimeout(r, 0));
    expect(screenAwakeReasons()).not.toContain('lesson-writing');
  });
});

describe('the live line reports the right measure for reading and for writing', () => {
  it('reading says how much there is to read and for how long; it gives no writing speed', () => {
    const t = beginWork(0, 12_000); // 12,000 characters of instructions and sources
    noteReading(t, 0);
    const line = workLine(currentWork(), 45_000);
    expect(line).toMatch(/Reading about 2400 words of instructions and sources \(45 s so far\)/);
    expect(line).toMatch(/Nothing written yet/);
    expect(line).not.toMatch(/a second/);
    endWork(t);
  });

  it('writing says how much has been written and how fast, as words a second, not tokens', () => {
    const t = beginWork(0, 12_000);
    noteReading(t, 0);
    noteWriting(t, 'x'.repeat(500), 40_000); // writing began at 40 s
    noteWriting(t, 'x'.repeat(1500), 60_000);
    const line = workLine({ ...currentWork(), chars: 1500 }, 60_000);
    // 1500 characters is about 300 words over 20 s of writing
    expect(line).toMatch(/Writing \(20 s\): about 300 words so far, about 15\.0 words a second\./);
    expect(line).not.toMatch(/Reading/);
    endWork(t);
  });

  it('gives no speed in the first moments of writing, when it would only be noise', () => {
    const t = beginWork(0);
    noteWriting(t, 'Hello there', 1000);
    expect(workLine(currentWork(), 2000)).not.toMatch(/a second/);
    endWork(t);
  });

  it('an unknown prompt size is not invented', () => {
    const t = beginWork(0);
    noteReading(t, 0);
    expect(workLine(currentWork(), 10_000)).toMatch(/Reading the instructions and sources \(10 s so far\)/);
    endWork(t);
  });
});

