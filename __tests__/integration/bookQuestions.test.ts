/**
 * Questions that are already in the textbook are used first. The AI is the device boundary here; it records what it was asked.
 */
import { installRealSqlite } from '../harness/sqliteFake';

const asked: string[] = [];
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async (_system: string, user: string) => { asked.push(user); return JSON.stringify({ questions: [
    { q: 'Q one?', options: ['a', 'b'], answer: 0, why: 'because' }, { q: 'Q two?', options: ['a', 'b'], answer: 1, why: 'because' }] }); }),
  gatherSources: jest.fn(async () => []),
}));

const BOOK = `Chapter 4 explains how a lessee accounts for a lease under ASC 842. The lessee records a right-of-use asset and a lease liability at the start of the lease.
The liability is the present value of the payments not yet made, and the asset starts at that amount plus any costs paid up front.
Capital gains depend on how long the asset was held: more than one year is long term, one year or less is short term for the tax return.
Chapter 4 review questions
1. Under ASC 842, which two items does a lessee record for most leases?
a) A right-of-use asset b) A lease liability c) Rent expense only
Answer: a and b
2. What is the capital of France?
Answer: Paris
3. A taxpayer sells stock held 14 months. Is the gain short term or long term for capital gains purposes?
Answer: Long term`;

it('finds the textbook questions on a topic, with the book\'s answers, and not unrelated ones', () => {
  const { extractQuestions, questionsOn } = require('../../src/study/bookQuestions');
  const bank = extractQuestions(BOOK, 'Tax book.pdf');
  expect(bank.length).toBeGreaterThanOrEqual(3);
  const leases = questionsOn(bank, 'Leases under ASC 842');
  expect(leases).toHaveLength(1);
  expect(leases[0]).toMatchObject({ answer: 'a and b', source: 'Tax book.pdf' });
  expect(questionsOn(bank, 'Capital gains and losses')[0].answer).toBe('Long term');
});

it('writes a quiz square starting from the textbook questions when the course project has them', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { squareContent } = require('../../src/topics/service');
  const { useTopics } = require('../../src/topics/store');
  const project = useProjectStore.getState().createProject({ name: 'Books', description: '', systemPrompt: '', icon: '#10B981' });
  await ragService.appendProjectDocuments([{ projectId: project.id, name: 'Tax book.pdf', path: '/x', size: 10, enabled: true, createdAt: '2026-01-01', chunks: [{ content: BOOK, position: 0 }] }]);
  const squares = [{ key: 's1', format: 'quiz', title: 'Leases', focus: 'Lessee accounting under ASC 842', unit: 'U1' }];
  useTopics.setState({ courses: [{ id: 'c', topic: 'FAR', title: 'FAR', summary: '', style: '', theme: '', request: { topic: 'FAR', goal: '', level: 'x', how: '', minutes: 10 }, squares, content: {}, progress: {}, createdAt: 1, sources: [], projectId: project.id }] });
  await squareContent(useTopics.getState().courses[0], 's1');
  expect(asked[0]).toContain("QUESTIONS FROM THE LEARNER'S OWN TEXTBOOK");
  expect(asked[0]).toContain('which two items does a lessee record');
  expect(asked[0]).toContain("book's answer: a and b");
  // The passages the square was written from are kept so the learner can check them.
  expect(useTopics.getState().courses[0].cited?.s1?.[0].source).toBe('Tax book.pdf');
  // A lesson square is not made of questions: no textbook questions are added.
  asked.length = 0;
  useTopics.setState({ courses: [{ ...useTopics.getState().courses[0], squares: [{ ...squares[0], format: 'lesson', key: 's2' }] }] });
  try { await squareContent(useTopics.getState().courses[0], 's2'); } catch { /* the stub reply is a quiz, not a lesson */ }
  expect(asked[0] ?? '').not.toContain("QUESTIONS FROM THE LEARNER'S OWN TEXTBOOK");
});

it('finds a question at the start of a page-numbered chunk and keeps the page in its source', () => {
  const { extractQuestions } = require('../../src/study/bookQuestions');
  const [q] = extractQuestions('(p. 212) 4. Which method values inventory using the oldest costs first?\nAnswer: FIFO', 'Tax book.pdf');
  expect(q).toMatchObject({ answer: 'FIFO', source: 'Tax book.pdf p. 212' });
});

it('tells the AI how hard to make a square, from the course difficulty', async () => {
  installRealSqlite();
  const { squareContent } = require('../../src/topics/service');
  const { useTopics } = require('../../src/topics/store');
  asked.length = 0;
  const squares = [{ key: 's1', format: 'quiz', title: 'Leases', focus: 'Lessee accounting', unit: 'U1' }];
  const base = { id: 'c', topic: 'FAR', title: 'FAR', summary: '', style: '', theme: '', request: { topic: 'FAR', goal: '', level: 'x', how: '', minutes: 10 }, squares, content: {}, progress: {}, createdAt: 1, sources: [] };
  useTopics.setState({ courses: [{ ...base, difficulty: 'hard' }] });
  await squareContent(useTopics.getState().courses[0], 's1');
  expect(asked[0]).toContain('HARD difficulty');
  asked.length = 0;
  useTopics.setState({ courses: [{ ...base, difficulty: 'beginner' }] });
  await squareContent(useTopics.getState().courses[0], 's1');
  expect(asked[0]).toContain('BEGINNER difficulty');
});
