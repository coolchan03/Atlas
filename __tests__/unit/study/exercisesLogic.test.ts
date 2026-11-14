/** Practice questions: grading every kind, grounding generated ones in the material, and the progress store. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  check, readExercises, groundExercises, exercisePrompt, answerText, streak, missedExercises, practiceSet, topicScores,
  useExerciseStore, flushPendingExerciseSaves, debouncedStorage, pruneBank, type Exercise,
} from '../../../src/study/exercises';

const ex = (o: Record<string, unknown>) => ({ id: 'e', prompt: 'p', ...o }) as unknown as Exercise;

describe('check', () => {
  it('grades choice and true/false strictly', () => {
    const mcq = ex({ kind: 'mcq', choices: ['a', 'b'], answer: 1 });
    expect(check(mcq, 1).correct).toBe(true);
    expect(check(mcq, '1').correct).toBe(true);
    expect(check(mcq, 0).correct).toBe(false);
    expect(check(mcq, null).correct).toBe(false);
    expect(check(mcq, -1).correct).toBe(false);
    expect(check(mcq, 1.5).correct).toBe(false);
    expect(check(mcq, 'b').correct).toBe(false);
    const tf = ex({ kind: 'truefalse', answer: false });
    expect(check(tf, false).correct).toBe(true);
    expect(check(tf, ' FALSE ').correct).toBe(true);
    expect(check(tf, 'maybe').correct).toBe(false);
    expect(check(tf, 0).correct).toBe(false);
  });
  it('grades fill-in, numbers and orders', () => {
    const fill = ex({ kind: 'fill', answers: ['Net income', '1,000'] });
    expect(check(fill, ' net  income! ').correct).toBe(true);
    expect(check(fill, '$1000').correct).toBe(true);
    expect(check(fill, 'gross').correct).toBe(false);
    const calc = ex({ kind: 'calc', answer: 12.5, tolerance: 0.5 });
    expect(check(calc, '12.9').correct).toBe(true);
    expect(check(calc, '(13)').correct).toBe(false);
    expect(check(calc, 'abc').correct).toBe(false);
    expect(check(ex({ kind: 'calc', answer: -4 }), '(4)').correct).toBe(true);
    const order = ex({ kind: 'order', items: ['a', 'b', 'c'] });
    expect(check(order, ['a', 'b', 'c']).correct).toBe(true);
    expect(check(order, ['a', 'c', 'b'])).toMatchObject({ correct: false, parts: [true, false, false] });
    expect(check(order, 'nope').correct).toBe(false);
  });
  it('grades matches, short answers, tables and testlets', () => {
    const match = ex({ kind: 'match', pairs: [['a', '1'], ['b', '2']] });
    expect(check(match, { a: '1', b: '2' }).correct).toBe(true);
    expect(check(match, { a: '1' })).toMatchObject({ correct: false, parts: [true, false] });
    expect(check(match, undefined).correct).toBe(false);
    const short = ex({ kind: 'short', keyTerms: ['lease', 'asset'], minTerms: 1 });
    expect(check(short, 'A Lease.').correct).toBe(true);
    expect(check(ex({ kind: 'short', keyTerms: ['lease', 'asset'] }), 'lease only').correct).toBe(false);
    const table = ex({ kind: 'table', rows: [
      { label: 'r1', account: 'Cash', amount: 5, group: 'assets' }, { label: 'r2', account: 'Debt', amount: 5, group: 'liab' },
    ], totals: [{ name: 'Balance', groups: ['assets'], equals: ['liab'] }] });
    expect(check(table, [{ account: 'cash', amount: '5' }, { account: 'Debt', amount: 5 }]).correct).toBe(true);
    const bad = check(table, [{ account: 'Cash', amount: 5 }, { account: 'Debt', amount: 9 }]);
    expect(bad.correct).toBe(false);
    expect(bad.note).toContain('Does not balance');
    expect(check(table, []).correct).toBe(false);
    expect(check(table, 'x').correct).toBe(false);
    expect(check(ex({ kind: 'table', rows: [{ label: 'r' }] }), [{}]).correct).toBe(true);
    const testlet = ex({ kind: 'testlet', stem: 's', items: [ex({ kind: 'truefalse', answer: true }), ex({ kind: 'fill', answers: ['x'] })] });
    expect(check(testlet, [true, 'x']).correct).toBe(true);
    expect(check(testlet, [true])).toMatchObject({ correct: false, parts: [true, false] });
    expect(check(testlet, null).correct).toBe(false);
  });
});

describe('reading and grounding generated questions', () => {
  const chunks = [{ doc: 'Notes', page: 3, section: 'Leases', text: 'A lease is a contract that transfers the right to use an asset.' }];
  const good = { kind: 'truefalse', prompt: 'A lease is a contract?', answer: true, source: { quote: 'A lease is a contract that transfers the right' } };
  it('reads JSON arrays and nothing else', () => {
    expect(readExercises('text [1,2] more')).toEqual([1, 2]);
    expect(readExercises('no array')).toEqual([]);
    expect(readExercises('[oops')).toEqual([]);
    expect(readExercises('[{"a":1}]')).toHaveLength(1);
  });
  it('keeps grounded questions with the chunk\'s page, and drops the rest with a reason', () => {
    const { kept, dropped } = groundExercises([good, { ...good, source: { quote: 'invented sentence that is not there' } }, { ...good, source: { quote: 'short' } }, { kind: 'mcq', prompt: 'x', choices: ['a'], answer: 0 }, null, { ...good, prompt: ' ' }], chunks, 'Leases');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ topic: 'Leases', source: { doc: 'Notes', page: 3, section: 'Leases' } });
    expect(dropped.map((d) => d.why)).toEqual(['not supported by the material', 'not supported by the material', 'malformed', 'malformed', 'malformed']);
  });
  it('accepts every well-formed kind', () => {
    const q = { quote: 'A lease is a contract that transfers the right' };
    const all = [
      { kind: 'mcq', prompt: 'p', choices: ['a', 'b'], answer: 1, source: q }, { kind: 'fill', prompt: 'p', answers: ['x'], source: q },
      { kind: 'calc', prompt: 'p', answer: 3, source: q }, { kind: 'order', prompt: 'p', items: ['a', 'b'], source: q },
      { kind: 'match', prompt: 'p', pairs: [['a', '1'], ['b', '2']], source: q }, { kind: 'table', prompt: 'p', rows: [{ label: 'r' }], source: q },
      { kind: 'short', prompt: 'p', keyTerms: ['a'], source: q }, { kind: 'testlet', prompt: 'p', stem: 's', items: [{ kind: 'truefalse', prompt: 'q', answer: true }], source: q },
    ];
    expect(groundExercises(all, chunks).kept).toHaveLength(all.length);
    expect(groundExercises([{ kind: 'unknown', prompt: 'p' }, { kind: 'mcq', prompt: 'p', choices: ['a', 'b'], answer: 5, source: q }, { kind: 'match', prompt: 'p', pairs: [['a'], ['b']], source: q }], chunks).kept).toHaveLength(0);
  });
  it('builds a prompt that names the material and its pages', () => {
    const prompt = exercisePrompt([...chunks, { doc: 'B', text: 'more' }], ['mcq', 'fill'], 4);
    expect(prompt).toContain('Write 4 study exercises');
    expect(prompt).toContain('p. 3');
    expect(prompt).toContain('mcq|fill');
  });
});

describe('answer text', () => {
  it('writes the right answer for every kind', () => {
    expect(answerText(ex({ kind: 'mcq', choices: ['a', 'b'], answer: 1 }))).toBe('b');
    expect(answerText(ex({ kind: 'truefalse', answer: true, why: 'because' }))).toBe('True. because');
    expect(answerText(ex({ kind: 'truefalse', answer: false }))).toBe('False');
    expect(answerText(ex({ kind: 'fill', answers: ['x'] }))).toBe('x');
    expect(answerText(ex({ kind: 'calc', answer: 3, unit: 'kg' }))).toBe('3 kg');
    expect(answerText(ex({ kind: 'calc', answer: 3 }))).toBe('3');
    expect(answerText(ex({ kind: 'order', items: ['a', 'b'] }))).toBe('a > b');
    expect(answerText(ex({ kind: 'match', pairs: [['a', '1']] }))).toBe('a = 1');
    expect(answerText(ex({ kind: 'short', keyTerms: ['a', 'b'] }))).toBe('a, b');
    expect(answerText(ex({ kind: 'table', rows: [{ label: 'L', amount: 2 }, { label: 'M', account: 'Cash' }] }))).toBe('L: 2; Cash');
    expect(answerText(ex({ kind: 'testlet', items: [ex({ kind: 'fill', answers: ['x'] })] }))).toBe('1. x');
  });
});

describe('the store and the helpers around it', () => {
  beforeEach(() => { useExerciseStore.setState({ exercises: {}, progress: {}, daily: {}, goal: { on: false, perDay: 10 } } as never); });
  const add = (id: string, o: Record<string, unknown> = {}) => useExerciseStore.getState().addSet([ex({ id, kind: 'truefalse', answer: true, topic: 'T', ...o })]);

  it('records attempts on a Leitner schedule and counts per phone and per day', () => {
    add('a');
    const st = () => useExerciseStore.getState();
    st().record('a', true, Date.UTC(2026, 0, 5));
    st().record('a', true, Date.UTC(2026, 0, 5));
    st().record('a', false, Date.UTC(2026, 0, 6));
    const p = st().progress.a;
    expect(p).toMatchObject({ attempts: 3, correct: 2, box: 0, last: false });
    expect(Object.values(p.dev!)[0]).toEqual({ a: 3, c: 2 });
    expect(st().daily['2026-01-05']).toBe(2);
    for (let i = 0; i < 8; i++) st().record('a', true, Date.UTC(2026, 0, 7 + i));
    expect(st().progress.a.box).toBe(5);
  });

  it('keeps notes, drafts and goals, and starts questions afresh', () => {
    add('a');
    const st = () => useExerciseStore.getState();
    st().setNote('a', 'x'.repeat(500));
    expect(st().progress.a.note).toHaveLength(400);
    st().saveDraft('a', { v: 1 });
    expect(st().progress.a.saved).toEqual({ v: 1 });
    st().freshen(['a', 'zzz']);
    expect(st().progress.a.saved).toBeUndefined();
    st().setGoal({ on: true });
    expect(st().goal).toEqual({ on: true, perDay: 10 });
  });

  it('clears by topic, project, exam or everything', () => {
    add('a', { topic: 'T1', projectId: 'p1' }); add('b', { topic: 'T2', projectId: 'p2', examCode: 'X' }); add('c', { topic: 'T3' });
    const st = () => useExerciseStore.getState();
    for (const id of ['a', 'b', 'c']) st().record(id, true);
    st().clearSet('T1');
    expect(Object.keys(st().exercises).sort()).toEqual(['b', 'c']);
    st().clearProject('p2');
    expect(Object.keys(st().exercises)).toEqual(['c']);
    add('d', { examCode: 'Y' });
    st().clearExam('Y');
    expect(Object.keys(st().exercises)).toEqual(['c']);
    st().clearAll();
    expect(st().exercises).toEqual({});
    expect(pruneBank({ a: ex({ id: 'a' }) }).exercises).toHaveProperty('a');
  });

  it('orders a practice set, scores topics and lists the missed', () => {
    const list = ['a', 'b', 'c', 'd'].map((id, i) => ex({ id, kind: 'truefalse', answer: true, topic: i < 2 ? 'T1' : 'T2' }));
    const now = 1_000_000;
    const progress = {
      a: { box: 2, due: now + 9999, attempts: 2, correct: 2, last: true }, b: { box: 0, due: now + 9999, attempts: 2, correct: 0, last: false },
      c: { box: 1, due: now - 1, attempts: 1, correct: 1, last: true },
    };
    expect(practiceSet(list, progress, { now }).map((e) => e.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(practiceSet(list, progress, { now, topic: 'T2', count: 1 }).map((e) => e.id)).toEqual(['c']);
    expect(missedExercises(list, progress).map((e) => e.id)).toEqual(['b']);
    expect(topicScores(list, progress)).toEqual([{ topic: 'T1', attempts: 4, percent: 50 }, { topic: 'T2', attempts: 1, percent: 100 }]);
    expect(topicScores([ex({ id: 'z', kind: 'fill', answers: [] })], { z: { box: 0, due: 0, attempts: 1, correct: 1 } })[0].topic).toBe('General');
  });

  it('counts a streak that may still be in progress today', () => {
    const daily = { '2026-01-03': 5, '2026-01-04': 6, '2026-01-05': 2 };
    expect(streak(daily, '2026-01-05', 5)).toBe(2);
    expect(streak({ ...daily, '2026-01-05': 5 }, '2026-01-05', 5)).toBe(3);
    expect(streak({}, '2026-01-05', 5)).toBe(0);
  });
});

describe('saving progress', () => {
  it('writes the latest value once, retries a failed write, and flushes on demand and when the app goes to the background', async () => {
    jest.useFakeTimers();
    const storage = debouncedStorage<unknown>(600);
    const setItem = jest.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined);
    storage.setItem('k', { state: 1 } as never);
    storage.setItem('k', { state: 2 } as never);
    jest.advanceTimersByTime(700);
    await flushPendingExerciseSaves();
    expect(setItem.mock.calls.filter((c) => String(c[1]).includes('"state":2'))).toHaveLength(1);
    expect(setItem.mock.calls.some((c) => String(c[1]).includes('"state":1'))).toBe(false);
    setItem.mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
    storage.setItem('k', { state: 3 } as never);
    const done = flushPendingExerciseSaves();
    await jest.advanceTimersByTimeAsync(1500);
    await done;
    expect(setItem.mock.calls.length).toBeGreaterThanOrEqual(3);
    await storage.removeItem('k');
    await storage.getItem('k');
    setItem.mockRestore();
    jest.useRealTimers();
  });
});
