/**
 * Exam grading: negative figures stay negative, a right answer is separate from a right answer backed by evidence,
 * and runs are only compared when they are the same exam.
 */
import {
  BENCHMARK_VERSION, scoreAnswer, runExam, improvementSummary, examContext, whyNotComparable, evidenceCounts,
  type ExamItem, type ExamMetrics, type ExamResult,
} from '../../../src/learning/exams';

describe('financial signs are preserved', () => {
  const loss = { facts: [['-5000', 'negative 5000']] };
  const gain = { facts: [['5000']] };

  it.each([
    'Net income was -5000.', 'Net income was -$5,000.', 'Net income was $-5,000.', 'Net income was ($5,000).', 'Net income was (5,000).',
    'Net income was −5000.', 'Net income was negative 5000.', 'Net income was minus 5000.',
  ])('%s is a loss of 5000, not a gain', (answer) => {
    expect(scoreAnswer(answer, gain).correct).toBe(false);
  });

  it.each(['-5000', '-$5,000', '$-5,000', '($5,000)', '(5,000)', '−5000', 'negative 5000'])('accepts %s as the negative key', (written) => {
    expect(scoreAnswer(`The result was ${written}.`, loss).correct).toBe(true);
  });

  it('a positive answer does not satisfy a negative key', () => {
    expect(scoreAnswer('The result was 5000.', loss).correct).toBe(false);
    expect(scoreAnswer('The result was a gain of $5,000.', loss).correct).toBe(false);
  });

  it('negative percentages and decimals keep their sign', () => {
    expect(scoreAnswer('Return was -2.5%.', { facts: [['2.5 percent']] }).correct).toBe(false);
    expect(scoreAnswer('Return was -2.5%.', { facts: [['-2.5%']] }).correct).toBe(true);
    expect(scoreAnswer('Return was (2.5%).', { facts: [['2.5%']] }).correct).toBe(false);
  });

  it('does not misread ranges, dates or clause numbers as negative', () => {
    expect(scoreAnswer('Read pages 5-10.', { facts: [['10']] }).correct).toBe(true);
    expect(scoreAnswer('See clause (2) of the lease.', { facts: [['2']] }).correct).toBe(true);
    expect(scoreAnswer('Filed on 2024-05-01.', { facts: [['2024']] }).correct).toBe(true);
  });

  it('still accepts ordinary positive answers written several ways', () => {
    expect(scoreAnswer('It costs $1,200.', { facts: [['1200 dollars']] }).correct).toBe(true);
    expect(scoreAnswer('The rate is 50%.', { facts: [['50 percent']] }).correct).toBe(true);
  });
});

const item = (id: string, subjectId = 's1', fact = 'turnover'): ExamItem => ({ id, subjectId, topic: 't', question: `Question ${id}?`, expected: { facts: [[fact]] } });
const items = [item('a'), item('b'), item('c')];
const metricsOf = (partial: Partial<ExamMetrics>): ExamMetrics => ({
  total: 3, correct: 0, accuracy: 0, outdatedAnswers: 0, unsupportedCitations: 0, repeatFailures: 0, averageSeconds: 0, items: [], ...partial,
});

describe('evidence-supported correctness is separate from correctness', () => {
  const answerer = (text: (id: string) => string, sourceCount = 2, passages?: string[]) => async (i: ExamItem) => ({ text: text(i.id), sourceCount, passages });

  it('a right answer with no citation is counted as unsupported, not as successful source use', async () => {
    const m = await runExam({ items, mode: 'sources', answer: answerer(() => 'The answer is turnover.') });
    expect(m.accuracy).toBe(1); // factually right
    expect(m.supportedAccuracy).toBe(0); // but nothing backs it
    expect(m).toMatchObject({ supportedCorrect: 0, unsupportedCorrect: 3 });
    expect(m.items.every((i) => i.evidence === 'unsupported')).toBe(true);
    expect(evidenceCounts(m)).toEqual({ supported: 0, unsupported: 3, incorrect: 0, ungraded: 0 });
  });

  it('a right answer citing a source it was given is supported', async () => {
    const m = await runExam({ items, mode: 'sources', answer: answerer(() => 'It is turnover [1].') });
    expect(m).toMatchObject({ accuracy: 1, supportedAccuracy: 1, supportedCorrect: 3, unsupportedCorrect: 0 });
  });

  it('a citation to a source that does not exist does not count as backing', async () => {
    const m = await runExam({ items, mode: 'sources', answer: answerer(() => 'It is turnover [7].') });
    expect(m).toMatchObject({ supportedAccuracy: 0, unsupportedCorrect: 3, unsupportedCitations: 3 });
  });

  it('when the cited text is known it must contain what the answer says', async () => {
    const m = await runExam({ items, mode: 'sources', answer: answerer(() => 'Turnover was 5000 [1].', 1, ['An unrelated paragraph about lease accounting and depreciation.']) });
    expect(m.items.every((i) => i.evidence === 'unsupported')).toBe(true);
    const ok = await runExam({ items, mode: 'sources', answer: answerer(() => 'Turnover was 5000 [1].', 1, ['Annual turnover was 5000 for the year, the report states.']) });
    expect(ok.items.every((i) => i.evidence === 'supported')).toBe(true);
  });

  it('the model alone is never "unsupported": it was given no sources to cite', async () => {
    const m = await runExam({ items, mode: 'baseline', answer: answerer(() => 'turnover', 0) });
    expect(m.items.every((i) => i.evidence === 'not-applicable')).toBe(true);
    expect(m.supportedAccuracy).toBe(1);
  });

  it('wrong and ungraded answers are their own categories', async () => {
    let n = 0;
    const m = await runExam({ items, mode: 'sources', answer: async () => {
      n += 1;
      if (n === 3) throw new Error('model failed');
      return { text: n === 1 ? 'It is turnover [1].' : 'No idea.', sourceCount: 1 };
    } });
    expect(evidenceCounts(m)).toEqual({ supported: 1, unsupported: 0, incorrect: 1, ungraded: 1 });
  });

  it('an improvement that rests on unsupported right answers is not claimed as sources helping', () => {
    const base: ExamResult = { id: 'b', version: BENCHMARK_VERSION, mode: 'baseline', at: 't', metrics: metricsOf({ total: 10, accuracy: 0.5 }) };
    const memory: ExamResult = { id: 'm', version: BENCHMARK_VERSION, mode: 'memory', at: 't', metrics: metricsOf({ total: 10, accuracy: 0.9, supportedAccuracy: 0.4, unsupportedCorrect: 5 }) };
    const text = improvementSummary([memory, base]);
    expect(text).toMatch(/does not show the sources or memory helped/);
    expect(text).toMatch(/5 of the right answers cited nothing/);
  });

  it('claims an improvement when the extra right answers are backed by sources', () => {
    const base: ExamResult = { id: 'b', version: BENCHMARK_VERSION, mode: 'baseline', at: 't', metrics: metricsOf({ total: 10, accuracy: 0.5 }) };
    const memory: ExamResult = { id: 'm', version: BENCHMARK_VERSION, mode: 'memory', at: 't', metrics: metricsOf({ total: 10, accuracy: 0.9, supportedAccuracy: 0.9, unsupportedCorrect: 0 }) };
    expect(improvementSummary([memory, base])).toMatch(/40 points better/);
  });
});

describe('only comparable runs are compared', () => {
  const run = (mode: 'baseline' | 'memory', accuracy: number, context?: ReturnType<typeof examContext>): ExamResult =>
    ({ id: mode, version: BENCHMARK_VERSION, mode, at: 't', metrics: metricsOf({ total: 10, accuracy, supportedAccuracy: accuracy, ...(context ? { context } : {}) }) });
  const ctx = (overrides: Partial<ReturnType<typeof examContext>> = {}) => ({ ...examContext(items, false, 'modelA'), ...overrides });

  it('identical subject, questions, model and grading are compared', () => {
    expect(improvementSummary([run('memory', 0.9, ctx()), run('baseline', 0.5, ctx())])).toMatch(/points better/);
  });

  it.each([
    ['a different subject', { subjectId: 'other' }, /different subjects/],
    ['different questions', { questionSet: 'deadbeef' }, /different questions/],
    ['a different model', { model: 'modelB' }, /different models/],
    ['different grading', { grading: 'benchmark 2, without Judge second opinion' }, /different rules/],
  ])('refuses runs with %s', (_name, change, message) => {
    const text = improvementSummary([run('memory', 0.9, ctx(change)), run('baseline', 0.5, ctx())]);
    expect(text).toMatch(message);
    expect(text).not.toMatch(/points better/);
  });

  it('refuses to compare a run with recorded context against one without', () => {
    expect(improvementSummary([run('memory', 0.9, ctx()), run('baseline', 0.5)])).toMatch(/saved before Atlas recorded/);
  });

  it('two runs from before context was recorded still compare (nothing to contradict)', () => {
    expect(improvementSummary([run('memory', 0.9), run('baseline', 0.5)])).toMatch(/points better/);
  });

  it('editing an answer key makes it a different question set', () => {
    const edited = items.map((i) => (i.id === 'a' ? { ...i, expected: { facts: [['revenue']] } } : i));
    expect(examContext(edited, false).questionSet).not.toBe(examContext(items, false).questionSet);
  });

  it('the question set does not depend on the order the questions are listed', () => {
    expect(examContext([...items].reverse(), false).questionSet).toBe(examContext(items, false).questionSet);
  });

  it('runExam records the context of the run', async () => {
    const m = await runExam({ items, mode: 'baseline', model: 'modelA', answer: async () => ({ text: 'turnover', sourceCount: 0 }) });
    expect(m.context).toEqual(examContext(items, false, 'modelA'));
    expect(whyNotComparable(m, m)).toBeNull();
  });
});
