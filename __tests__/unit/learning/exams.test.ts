import { BENCHMARK_VERSION, ExamStore, improvementSummary, reasonCounts, runExam, scoreAnswer, type ExamItem, type ExamResult, type ExamMetrics } from '../../../src/learning/exams';
import { memoryKnowledgeDb } from '../../harness/memoryKnowledgeDb';

const expected = { facts: [['one minute', '1 minute', '60 seconds'], ['cool']], forbid: ['ten minutes'] };

describe('scoring an exam answer without a model', () => {
  it('needs every fact, accepts any wording of each, and sees numbers written out', () => {
    expect(scoreAnswer('Boil it for 1 minute, then let it cool.', expected)).toEqual({ score: 1, correct: true, outdated: false, missing: [] });
    expect(scoreAnswer('Boil it for one minute.', expected)).toEqual({ score: 0.5, correct: false, outdated: false, missing: ['cool'] });
  });

  it('marks an answer that uses a forbidden figure, even when the facts are there', () => {
    expect(scoreAnswer('Boil it for one minute, or ten minutes, and cool it.', expected)).toMatchObject({ score: 1, correct: false, outdated: true });
  });
});

describe('wording tolerance without rewarding wrong answers', () => {
  const lease = { facts: [['lease liability'], ['right-of-use asset']] };
  it('accepts reordered and singular/plural wording', () => {
    expect(scoreAnswer('The lessee records a right of use asset and a liability for the lease.', lease).correct).toBe(true);
    expect(scoreAnswer('Recorded lease liabilities and right-of-use assets appear on the balance sheet.', lease).correct).toBe(true);
  });
  it('treats equivalent numbers and units as the same', () => {
    expect(scoreAnswer('The rate is 50 percent.', { facts: [['50%']] }).correct).toBe(true);
    expect(scoreAnswer('It costs $1,200.', { facts: [['1200 dollars']] }).correct).toBe(true);
    expect(scoreAnswer('Wait sixty seconds.', { facts: [['1 minute']] }).correct).toBe(true);
    expect(scoreAnswer('Wait 90 seconds.', { facts: [['1 minute']] }).correct).toBe(false);
  });
  it('does not accept a missing fact, a different number, a negation or a contradiction', () => {
    expect(scoreAnswer('Only a lease liability is recorded.', lease)).toMatchObject({ correct: false, missing: ['right-of-use asset'] });
    expect(scoreAnswer('The rate is 120 percent.', { facts: [['20 percent']] }).correct).toBe(false);
    expect(scoreAnswer('It is not a lease liability, and there is a right-of-use asset.', lease).correct).toBe(false);
    expect(scoreAnswer('The lease liability is never recorded; the right-of-use asset is.', lease).correct).toBe(false);
    expect(scoreAnswer('Straight-line depreciation applies, not declining balance.', { facts: [['declining balance']] }).correct).toBe(false);
    expect(scoreAnswer('The limit is 10,000 dollars, formerly 5,000.', { facts: [['10000']], forbid: ['5000'] })).toMatchObject({ correct: false, outdated: true });
  });
  it('does not match words scattered far apart', () => {
    const far = `lease ${'filler words '.repeat(20)} liability`;
    expect(scoreAnswer(far, { facts: [['lease liability']] }).correct).toBe(false);
  });
});

describe('failure reasons', () => {
  const items: ExamItem[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, subjectId: 's', topic: 't', question: `Question ${id}?`, expected }));
  items.push({ id: 'bad', subjectId: 's', topic: 't', question: 'Q?', expected: { facts: [] } });
  const run = (mode: 'baseline' | 'sources' | 'memory', answer: (id: string) => any) => runExam({ items, mode, answer: async (i) => answer(i.id) });

  it('separates a wrong answer, an inference failure, an unusable key and missing evidence, and grades only what can be graded', async () => {
    const m = await run('memory', (id) => {
      if (id === 'a') return { text: 'Boil one minute and cool.', sourceCount: 1, memoryCount: 1 };
      if (id === 'b') return { text: 'Just cook it.', sourceCount: 1, memoryCount: 0 };
      if (id === 'c') throw new Error('model unloaded');
      return { text: 'Something else', sourceCount: 0, memoryCount: 0 };
    });
    const by = Object.fromEntries(m.items.map((i) => [i.id, i]));
    expect(by.a.reason).toBe('correct');
    expect(by.b.reason).toBe('no-approved-memory');
    expect(by.c).toMatchObject({ reason: 'inference-failure', error: 'model unloaded' });
    expect(by.d.reason).toBe('no-sources');
    expect(by.bad.reason).toBe('invalid-key');
    expect(m).toMatchObject({ total: 5, ungraded: 2, correct: 1 });
    expect(m.accuracy).toBeCloseTo(1 / 3);
    expect(by.b.missing).toEqual(['one minute', 'cool']);
    expect(reasonCounts(m).map((r) => r.reason).sort()).toEqual(['inference-failure', 'invalid-key', 'no-approved-memory', 'no-sources']);
  });

  it('records the model\'s wrong answer, and an empty one', async () => {
    const m = await run('baseline', (id) => ({ text: id === 'a' ? '' : 'Boil ten minutes.', sourceCount: 0 }));
    expect(m.items.find((i) => i.id === 'a')?.reason).toBe('empty-answer');
    expect(m.items.find((i) => i.id === 'b')).toMatchObject({ reason: 'outdated', answer: 'Boil ten minutes.' });
    expect(m.items.find((i) => i.id === 'c')?.reason).toBe('outdated');
  });

  it('repeated attempts keep separate history and scoring versions', () => {
    expect(BENCHMARK_VERSION).toBe('2');
  });
});

describe('running an exam', () => {
  const items: ExamItem[] = ['a', 'b'].map((id) => ({ id, subjectId: 's', topic: 't', question: `Question ${id}?`, expected }));
  const clock = () => { let t = 0; return () => (t += 2000); };

  it('measures accuracy, outdated answers, unsupported citations, repeat failures and time', async () => {
    const answers: Record<string, { text: string; sourceCount: number }> = {
      a: { text: 'Boil one minute and let it cool. [1]', sourceCount: 1 },
      b: { text: 'Boil ten minutes. [3]', sourceCount: 1 },
    };
    const metrics = await runExam({ items, mode: 'sources', answer: async (item) => answers[item.id], previousFailures: ['b'], now: clock() });
    expect(metrics).toMatchObject({ total: 2, correct: 1, accuracy: 0.5, outdatedAnswers: 1, unsupportedCitations: 1, repeatFailures: 1, averageSeconds: 2 });
  });
});

describe('keeping the exam apart from learning', () => {
  it('stores items per subject, recognises an exam question, and keeps a history', async () => {
    const store = new ExamStore(memoryKnowledgeDb());
    const id = store.addItem({ subjectId: 's', topic: 'water', question: 'How long should water be boiled to make it safe?', expected });
    expect(store.items('s')).toHaveLength(1);
    expect(store.items('other')).toHaveLength(0);
    expect(store.isExamQuestion('How long should water be boiled to make it safe')).toBe(true);
    expect(store.isExamQuestion('What temperature kills bacteria?')).toBe(false);
    store.saveResult('baseline', { total: 1, correct: 0, accuracy: 0, outdatedAnswers: 0, unsupportedCitations: 0, repeatFailures: 0, averageSeconds: 1, items: [{ id, correct: false, score: 0, outdated: false, seconds: 1 }] });
    expect(store.lastFailures('baseline')).toEqual([id]);
    expect(store.history()[0]).toMatchObject({ mode: 'baseline', version: BENCHMARK_VERSION });
    store.removeItem(id);
    expect(store.items('s')).toEqual([]);
  });
});

describe('claiming improvement only when it was measured', () => {
  const result = (mode: ExamResult['mode'], accuracy: number, total = 10): ExamResult => ({
    id: mode, version: BENCHMARK_VERSION, mode, at: '2026-01-01', metrics: { total, correct: accuracy * total, accuracy, outdatedAnswers: 0, unsupportedCitations: 0, repeatFailures: 0, averageSeconds: 1, items: [] } as ExamMetrics,
  });

  it('says what the numbers show, and refuses to claim without enough data', () => {
    expect(improvementSummary([result('memory', 0.8), result('baseline', 0.4)])).toContain('40 points better');
    expect(improvementSummary([result('memory', 0.4), result('baseline', 0.6)])).toContain('No measured improvement');
    expect(improvementSummary([result('memory', 1, 3), result('baseline', 0, 3)])).toContain('too few');
    expect(improvementSummary([result('memory', 0.8)])).toContain('Run the exam');
  });
});

describe('what to retest', () => {
  const run = (version: string, items: any[], ungraded = 0): ExamResult => ({ id: 'r', version, mode: 'memory', at: '2026-01-01', metrics: { total: items.length, ungraded, correct: items.filter((i) => i.correct).length, accuracy: 0, outdatedAnswers: 0, unsupportedCitations: 0, repeatFailures: 0, averageSeconds: 1, items } as ExamMetrics });
  it('names the missed questions of the newest run and the ones that could not be graded', () => {
    const { retestNote } = require('../../../src/learning/exams');
    const note = retestNote([run(BENCHMARK_VERSION, [{ id: 'a', correct: false, reason: 'wrong-answer' }, { id: 'b', correct: true, reason: 'correct' }, { id: 'c', correct: false, reason: 'inference-failure' }], 1)]);
    expect(note).toContain('1 question missed');
    expect(note).toContain('1 could not be graded');
  });
  it('says nothing when everything passed, and will not compare older scoring rules', () => {
    const { retestNote } = require('../../../src/learning/exams');
    expect(retestNote([run(BENCHMARK_VERSION, [{ id: 'a', correct: true, reason: 'correct' }])])).toBe('');
    expect(retestNote([run('1', [{ id: 'a', correct: false }])])).toContain('older scoring rules');
    expect(retestNote([])).toBe('');
  });
});

describe('retest schedule and answer history', () => {
  const { dueRetests, attemptsFor } = require('../../../src/learning/exams');
  const DAY = 86_400_000;
  const at = (daysAgo: number, now: Date) => new Date(now.getTime() - daysAgo * DAY).toISOString();
  const res = (when: string, items: any[], retest = false): ExamResult => ({ id: when, version: BENCHMARK_VERSION, mode: 'memory', at: when, metrics: { total: items.length, correct: 0, accuracy: 0, outdatedAnswers: 0, unsupportedCitations: 0, repeatFailures: 0, averageSeconds: 1, items, retest } as ExamMetrics });
  const now = new Date('2026-12-01T12:00:00Z');
  const miss = { id: 'a', correct: false, reason: 'wrong-answer', answer: 'x' };

  it('a missed question is due after a day, then 3 days after a second miss, then 7', () => {
    expect(dueRetests([{ id: 'a' }], [res(at(0.5, now), [miss])], now)).toEqual([]);
    expect(dueRetests([{ id: 'a' }], [res(at(1.1, now), [miss])], now)).toEqual(['a']);
    const twice = [res(at(2, now), [miss]), res(at(5, now), [miss])];
    expect(dueRetests([{ id: 'a' }], twice, now)).toEqual([]); // two misses: wait 3 days from the latest (2 days ago)
    expect(dueRetests([{ id: 'a' }], [res(at(3.5, now), [miss]), res(at(9, now), [miss])], now)).toEqual(['a']);
  });
  it('a question that was then passed, never asked, or only ungraded is not due; older scoring versions are ignored', () => {
    expect(dueRetests([{ id: 'a' }], [res(at(5, now), [miss]), res(at(1, now), [{ id: 'a', correct: true, reason: 'correct' }])], now)).toEqual([]);
    expect(dueRetests([{ id: 'b' }], [res(at(5, now), [miss])], now)).toEqual([]);
    expect(dueRetests([{ id: 'a' }], [res(at(5, now), [{ id: 'a', correct: false, reason: 'inference-failure' }])], now)).toEqual([]);
    expect(dueRetests([{ id: 'a' }], [{ ...res(at(5, now), [miss]), version: '1' }], now)).toEqual([]);
  });
  it('lists every attempt at a question, newest first, with its reason and answer', () => {
    const h = [res(at(3, now), [miss]), res(at(1, now), [{ id: 'a', correct: true, reason: 'correct', answer: 'right' }], true)];
    const a = attemptsFor(h, 'a');
    expect(a.map((x: any) => x.correct)).toEqual([true, false]);
    expect(a[1]).toMatchObject({ reason: 'wrong-answer', answer: 'x' });
  });
  it('a retest run does not count in the memory-versus-model comparison', () => {
    const full = res(at(2, now), Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, correct: true })));
    const partial = res(at(1, now), [{ id: 'q1', correct: false }], true);
    const base: ExamResult = { ...full, id: 'b', mode: 'baseline', at: at(2, now), metrics: { ...full.metrics, accuracy: 0.4 } as ExamMetrics };
    const mem: ExamResult = { ...full, metrics: { ...full.metrics, accuracy: 0.8 } as ExamMetrics };
    expect(improvementSummary([partial, mem, base])).toContain('better');
  });
});
