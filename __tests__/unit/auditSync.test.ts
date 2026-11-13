import { mergeExercises } from '../../src/services/nearbySync/exerciseMerge';
import { docKey } from '../../src/services/nearbySync/projectDocs';

const wrap = (progress: any, deviceId: string) => JSON.stringify({ state: { exercises: { q1: { id: 'q1' } }, progress, daily: {}, deviceId }, version: 1 });
const base = { box: 1, due: 5, attempts: 3, correct: 2 };

describe('T19 two phones study the same question from one baseline', () => {
  const phone = wrap({ q1: { ...base, attempts: 9, correct: 5, base: 3, baseC: 2, dev: { P: { a: 6, c: 3 } } } }, 'P');
  const tablet = wrap({ q1: { ...base, attempts: 12, correct: 8, base: 3, baseC: 2, dev: { T: { a: 9, c: 6 } } } }, 'T');
  it('counts every independent attempt once', () => {
    const m = JSON.parse(mergeExercises(phone, tablet)).state;
    expect(m.progress.q1.attempts).toBe(18);
    expect(m.progress.q1.correct).toBe(2 + 3 + 6);
    expect(m.deviceId).toBe('P');
  });
  it('is idempotent and symmetric', () => {
    const once = mergeExercises(phone, tablet);
    const twice = mergeExercises(once, tablet);
    expect(JSON.parse(twice).state.progress.q1.attempts).toBe(18);
    expect(JSON.parse(mergeExercises(tablet, phone)).state.progress.q1.attempts).toBe(18);
  });
});

describe('T18 same name and length, different bytes', () => {
  it('gives the two revisions different keys', () => {
    const a = { projectId: 'p', name: 'book.pdf', size: 100, sha256: 'a'.repeat(64) };
    expect(docKey(a)).not.toBe(docKey({ ...a, sha256: 'b'.repeat(64) }));
    expect(docKey(a)).toBe(docKey({ ...a }));
  });
});
