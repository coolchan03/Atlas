import { buildMockExam, gradeExam } from '../../../src/study/exam';
import type { Exercise } from '../../../src/study/exercises';

const q = (id: string, topic: string): Exercise => ({ id, topic, kind: 'truefalse', prompt: id, answer: true });
const bank = [...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => q(id, 'Leases')), ...['b1', 'b2'].map((id) => q(id, 'Basis')), q('c1', 'Bonds')];

it('spreads a mock exam evenly over the topics and gives 90 seconds a question', () => {
  const exam = buildMockExam(bank, {}, { count: 6 });
  expect(exam.ids).toHaveLength(6);
  const topics = exam.ids.map((id) => bank.find((e) => e.id === id)!.topic);
  expect(topics.filter((t) => t === 'Leases').length).toBe(3);
  expect(topics.filter((t) => t === 'Basis').length).toBe(2);
  expect(topics).toContain('Bonds');
  expect(exam.minutes).toBe(9);
});

it('missed questions come first within a topic', () => {
  const exam = buildMockExam(bank, { a5: { box: 0, due: 0, attempts: 2, correct: 0, last: false } }, { count: 3 });
  expect(exam.ids).toContain('a5');
});

it('reports the pace by topic when times were recorded', () => {
  const exam = buildMockExam(bank, {}, { count: 3 });
  const bankById = Object.fromEntries(bank.map((e) => [e.id, e]));
  const times = Object.fromEntries(exam.ids.map((id, i) => [id, (i + 1) * 20]));
  const graded = gradeExam(exam, bankById, {}, times);
  expect(graded.pace?.averageSeconds).toBe(40);
  expect(graded.pace?.slowest[0].seconds).toBe(60);
  expect(gradeExam(exam, bankById, {}).pace).toBeUndefined();
});
