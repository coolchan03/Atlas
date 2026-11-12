import { BENCHMARK_VERSION, ExamStore, improvementSummary, runExam, scoreAnswer, type ExamItem, type ExamResult, type ExamMetrics } from '../../../src/learning/exams';
import { memoryKnowledgeDb } from '../../harness/memoryKnowledgeDb';

const expected = { facts: [['one minute', '1 minute', '60 seconds'], ['cool']], forbid: ['ten minutes'] };

describe('scoring an exam answer without a model', () => {
  it('needs every fact, accepts any wording of each, and sees numbers written out', () => {
    expect(scoreAnswer('Boil it for 1 minute, then let it cool.', expected)).toEqual({ score: 1, correct: true, outdated: false });
    expect(scoreAnswer('Boil it for one minute.', expected)).toEqual({ score: 0.5, correct: false, outdated: false });
  });

  it('marks an answer that uses a forbidden figure, even when the facts are there', () => {
    expect(scoreAnswer('Boil it for one minute, or ten minutes, and cool it.', expected)).toMatchObject({ score: 1, correct: false, outdated: true });
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
