import { combine } from '../../../src/services/nearbySync/stores';

const store = (state: object) => JSON.stringify({ state, version: 0 });

it('keeps every question and the more-studied copy of each, so studying on two phones does not overwrite either', () => {
  const phone = store({
    exercises: { q1: { id: 'q1', prompt: 'one' }, q2: { id: 'q2', prompt: 'two' } },
    progress: { q1: { box: 3, due: 500, attempts: 6, correct: 5 }, q2: { box: 1, due: 100, attempts: 1, correct: 1 } },
    daily: { '2026-01-01': 4 }, goal: { on: true, perDay: 10 },
  });
  const tablet = store({
    exercises: { q2: { id: 'q2', prompt: 'two' }, q3: { id: 'q3', prompt: 'three' } },
    progress: { q1: { box: 0, due: 900, attempts: 1, correct: 0 }, q2: { box: 4, due: 400, attempts: 9, correct: 9 } },
    daily: { '2026-01-01': 7, '2026-01-02': 2 }, goal: { on: false, perDay: 5 },
  });
  const merged = JSON.parse(combine('atlas-exercises', { local: phone, remote: tablet })!).state;
  expect(Object.keys(merged.exercises).sort()).toEqual(['q1', 'q2', 'q3']);
  expect(merged.progress.q1.attempts).toBe(6); // the phone studied q1 more
  expect(merged.progress.q2.attempts).toBe(9); // the tablet studied q2 more
  expect(merged.daily).toEqual({ '2026-01-01': 7, '2026-01-02': 2 });
  expect(merged.goal).toEqual({ on: false, perDay: 5 }); // settings follow the newer copy
});

it('takes the other phone\'s copy whole when this phone has none', () => {
  const remote = store({ exercises: { q1: { id: 'q1' } }, progress: {}, daily: {} });
  expect(combine('atlas-exercises', { local: null, remote })).toBe(remote);
});
