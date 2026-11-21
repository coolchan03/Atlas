import { sessionSet } from '../../src/study/session';
import type { Exercise } from '../../src/study/exercises';

const q = (id: string, kind: any = 'mcq'): Exercise => ({ id, kind, prompt: id, choices: ['a', 'b'], answer: 0, answers: ['a'], items: ['a', 'b'], pairs: [['a', 'b'], ['c', 'd']], keyTerms: ['a'], rows: [], stem: '' }) as any;

describe('UX-20 quick sessions', () => {
  const pool = Array.from({ length: 40 }, (_, i) => q(`q${i}`));
  it('fits the time: 5 minutes of 45 s questions is about 6, 20 minutes about 26', () => {
    const five = sessionSet(pool, {}, 5); const twenty = sessionSet(pool, {}, 20);
    expect(five.set.length).toBeGreaterThanOrEqual(5); expect(five.set.length).toBeLessThanOrEqual(7);
    expect(twenty.set.length).toBeGreaterThan(five.set.length);
    expect(five.estimateMinutes).toBeLessThanOrEqual(6);
  });
  it('puts missed and due questions first', () => {
    const progress = { q9: { box: 0, due: 0, attempts: 1, correct: 0, last: false }, q3: { box: 2, due: Date.now() + 9e9, attempts: 3, correct: 3, last: true } } as any;
    const s = sessionSet(pool, progress, 5);
    expect(s.set[0].id).toBe('q9');
    expect(s.set.map((e) => e.id)).not.toContain('q3'); // known and not due yet
  });
  it('always offers one question when something is long, and nothing when the pool is empty', () => {
    expect(sessionSet([q('t', 'testlet')], {}, 5).set).toHaveLength(1);
    expect(sessionSet([], {}, 10).set).toHaveLength(0);
  });
  it('uses only the questions it is given (the caller scopes them to one exam)', () => {
    const far = pool.slice(0, 3).map((e) => ({ ...e, examCode: 'FAR' }));
    expect(sessionSet(far, {}, 20).set.every((e: any) => e.examCode === 'FAR')).toBe(true);
  });
});
