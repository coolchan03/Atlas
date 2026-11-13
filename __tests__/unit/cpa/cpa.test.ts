import { CPA_EXAMS as EXAMS } from '../../../src/cpa/blueprints';
import { toExercise, topicFor } from '../../../src/cpa/importQuestions';
import { parseOutline } from '../../../src/cpa/outline';
import { describeEvidence, topicEvidence } from '../../../src/cpa/progress';
import { check, type Exercise, type Progress } from '../../../src/study/exercises';

const q = (over: Partial<{ question: string; answer: string; options: string[]; alternatives: string[]; topic: string }>) => ({ question: 'What is the answer to this question?', answer: 'x', alternatives: [], ...over });

describe('the four exams', () => {
  it('each has areas and topics, and the names are unique within an exam', () => {
    expect(EXAMS.map((e) => e.code).sort()).toEqual(['AUD', 'FAR', 'REG', 'TCP']);
    for (const e of EXAMS) {
      const names = e.areas.flatMap((a) => a.topics);
      expect(names.length).toBeGreaterThan(15);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('the other professional exams', () => {
  it('each has areas and unique topics', () => {
    const { OTHER_EXAMS } = require('../../../src/cpa/blueprints');
    expect(OTHER_EXAMS.map((e: { code: string }) => e.code).sort()).toEqual(['ACT', 'BAR', 'CFA1', 'CFA2', 'CISSP', 'CMA1', 'CMA2', 'EA', 'GMAT', 'GRE', 'LSAT', 'MCAT', 'NCLEX', 'PMP', 'SAT', 'SERIES7', 'USMLE1']);
    for (const e of OTHER_EXAMS) expect(e.field).toBeTruthy();
    for (const e of OTHER_EXAMS) {
      const names = e.areas.flatMap((a: { topics: string[] }) => a.topics);
      expect(names.length).toBeGreaterThan(8);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('pasting an outline', () => {
  it('a line ending in a colon starts an area and the lines after it are its topics', () => {
    expect(parseOutline('Area I: Taxes:\nBasis\n- Capital gains\n2. Section 1231\nArea II:\nS corporations')).toEqual([
      { area: 'Area I: Taxes', topics: ['Basis', 'Capital gains', 'Section 1231'] },
      { area: 'Area II', topics: ['S corporations'] },
    ]);
    expect(parseOutline('Leases\nRevenue')).toEqual([{ area: 'Topics', topics: ['Leases', 'Revenue'] }]);
    expect(parseOutline('')).toEqual([]);
  });
});

describe('questions from a bank become checkable practice questions', () => {
  it('multiple choice stays multiple choice with the right option marked', () => {
    const ex = toExercise(q({ question: 'Which is a noble gas?', answer: 'Neon', options: ['Oxygen', 'Neon', 'Iron'] }), 'p1', 'Leases') as Extract<Exercise, { kind: 'mcq' }>;
    expect(ex.kind).toBe('mcq');
    expect(ex.answer).toBe(1);
    expect(check(ex, 1).correct).toBe(true);
    expect(check(ex, 0).correct).toBe(false);
  });
  it('a number is checked as a number, with the dollar sign and commas ignored', () => {
    const ex = toExercise(q({ answer: '$12,500' }), 'p1', 'Inventory');
    expect(ex.kind).toBe('calc');
    expect(check(ex, '12500').correct).toBe(true);
    expect(check(ex, '12,500.00').correct).toBe(true);
    expect(check(ex, '12400').correct).toBe(false);
    expect(check(toExercise(q({ answer: '(300)' }), 'p1', 't'), '-300').correct).toBe(true);
  });
  it('true or false, and a written answer checked against its key terms', () => {
    expect(check(toExercise(q({ answer: 'False' }), 'p1', 't'), false).correct).toBe(true);
    const short = toExercise(q({ answer: 'Straight-line method', alternatives: ['straight line'] }), 'p1', 't');
    expect(check(short, 'It is the straight-line method').correct).toBe(true);
    expect(check(short, 'declining balance').correct).toBe(false);
  });
  it('files a question under the topic the AI named, else the closest by wording, else General', () => {
    const topics = ['Revenue recognition', 'Leases', 'Inventory'];
    expect(topicFor(q({ topic: 'leases' }), topics)).toBe('Leases');
    expect(topicFor(q({ question: 'How is inventory valued under FIFO?' }), topics)).toBe('Inventory');
    expect(topicFor(q({ question: 'Name the capital of France today' }), topics)).toBe('General');
  });
});

describe('understanding is shown from how you answered, not from a tick', () => {
  const mk = (n: number, topic = 'Leases'): Exercise[] => Array.from({ length: n }, (_, i) => ({ id: `${topic}${i}`, topic, projectId: 'p1', kind: 'truefalse', prompt: `Statement number ${i}`, answer: true }));
  const progress = (ids: string[], right: string[]): Record<string, Progress> => Object.fromEntries(ids.map((id) => [id, { box: 1, due: 0, attempts: 3, correct: right.includes(id) ? 3 : 0, last: right.includes(id) }]));
  it('not checked until a question has been tried', () => {
    expect(topicEvidence(mk(8), {}, { topic: 'Leases' }).status).toBe('not-checked');
  });
  it('needs five different questions: four right is not enough to say understood', () => {
    const list = mk(4);
    const e = topicEvidence(list, progress(list.map((x) => x.id), list.map((x) => x.id)), { topic: 'Leases' });
    expect(e.status).toBe('needs-work');
    expect(describeEvidence(e)).toMatch(/4 of 4 right: try at least 5 different questions/);
  });
  it('five different questions with 80% right is understood, and below that needs work', () => {
    const list = mk(5);
    const ids = list.map((x) => x.id);
    expect(topicEvidence(list, progress(ids, ids.slice(0, 4)), { topic: 'Leases' }).status).toBe('understood');
    expect(topicEvidence(list, progress(ids, ids.slice(0, 3)), { topic: 'Leases' }).status).toBe('needs-work');
  });
  it('the same question answered many times counts once, and another exam\'s questions do not count', () => {
    const one = mk(1);
    expect(topicEvidence(one, { Leases0: { box: 5, due: 0, attempts: 50, correct: 50, last: true } }, { topic: 'Leases' }).questions).toBe(1);
    const other: Exercise[] = mk(6).map((e) => ({ ...e, projectId: 'p2' }));
    expect(topicEvidence(other, progress(other.map((x) => x.id), other.map((x) => x.id)), { topic: 'Leases', projectId: 'p1' }).status).toBe('not-checked');
  });
});

describe('the exam date', () => {
  const { pace, describePace, validDay } = require('../../../src/cpa/schedule');
  const now = new Date(2026, 5, 1, 15, 0, 0).getTime();
  it('counts the days and how many topics a week that leaves', () => {
    const p = pace('2026-06-29', 8, now);
    expect(p).toEqual({ daysLeft: 28, remaining: 8, perWeek: 2 });
    expect(describePace(p)).toBe('28 days to go, 8 topics still to understand: about 2 a week.');
    expect(describePace(pace('2026-06-29', 0, now))).toMatch(/Every topic is understood/);
    expect(describePace(pace('2026-05-01', 3, now))).toMatch(/has passed/);
    expect(describePace(pace('2026-06-01', 3, now))).toBe('The exam is today.');
  });
  it('ignores a date that is not real', () => {
    expect(validDay('2026-02-30')).toBeUndefined();
    expect(validDay('June 1')).toBeUndefined();
    expect(pace('nonsense', 3, now)).toBeNull();
  });
});
