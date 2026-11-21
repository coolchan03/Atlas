import { weakBoardPlan, weakTopics } from '../../../src/cpa/weakBoard';

const topic = (name: string) => ({ id: name, area: 'Transactions', name, covered: false });
const q = (id: string, t: string) => ({ id, kind: 'truefalse', prompt: id, answer: true, topic: t, examCode: 'FAR' }) as any;
const p = (last: boolean) => ({ box: 0, due: 0, attempts: 1, correct: last ? 1 : 0, last });

describe('the review board of weak spots', () => {
  const exercises = [q('1', 'Leases'), q('2', 'Leases'), q('3', 'Leases'), q('4', 'Leases'), q('5', 'Revenue'), q('6', 'Revenue'), q('7', 'Revenue'), q('8', 'Revenue')];
  const progress = { 1: p(false), 2: p(false), 3: p(true), 4: p(false), 5: p(true), 6: p(true), 7: p(true), 8: p(true) } as any;
  const topics = [topic('Leases'), topic('Revenue'), topic('Income taxes')];

  it('takes the topics practice shows are weak, weakest first, and leaves out understood and unchecked ones', () => {
    const weak = weakTopics({ topics, exercises, progress, examCode: 'FAR' });
    expect(weak.map((w) => w.topic.name)).toEqual(['Leases']);
    expect(weak[0]).toMatchObject({ rightLast: 1, questions: 4 });
  });

  it('plans a lesson that explains it again, its quiz, assignment and exam, and a review exam last', () => {
    const plan = weakBoardPlan('CPA FAR', weakTopics({ topics, exercises, progress, examCode: 'FAR' }));
    expect(plan.squares[0]).toMatchObject({ format: 'lesson', title: 'Leases', remedial: true });
    expect(plan.squares[0].focus).toMatch(/1 of 4 right/);
    expect(plan.squares.map((s) => s.format)).toEqual(['lesson', 'cards', 'worked', 'quiz', 'practice', 'quiz', 'quiz']);
    expect(plan.squares[plan.squares.length - 1]).toMatchObject({ title: 'Review exam', checkpoint: true });
  });
});
