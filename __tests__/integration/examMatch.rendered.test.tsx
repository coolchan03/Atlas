/**
 * Books first, then the exam: a course connected to a project of textbooks is matched against an exam's topic list. Topics the
 * books never mention are listed as gaps, topics they cover but the board lacks can be added as lessons. SQLite is the boundary.
 */
import { installRealSqlite } from '../harness/sqliteFake';
import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { courseId: 'c1' } }),
}));

const para = (text: string, n: number) => Array.from({ length: n }, (_, i) => ({ content: `${text} ${i}`, position: i }));

it('lists exam topics the books never cover, and adds the covered ones to the board as lessons', async () => {
  installRealSqlite();
  const rtl = requireRTL();
  const React = require('react');
  const { ragService } = require('../../src/services/rag');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { useTopics } = require('../../src/topics/store');
  const { TopicBoardScreen } = require('../../src/topics/TopicScreens');
  const project = useProjectStore.getState().createProject({ name: 'My books', description: '', systemPrompt: '', icon: '#10B981' });
  await ragService.appendProjectDocuments([{ projectId: project.id, name: 'Tax book.pdf', path: '/x', size: 10, enabled: true, createdAt: '2026-01-01',
    chunks: [...para('Basis of property: how to work out basis for assets and the adjusted basis', 3), ...para('Capital gains and losses: netting short term capital gains and losses', 3)] }]);
  useTopics.setState({ courses: [{ id: 'c1', topic: 'Tax', title: 'Tax book', summary: '', style: '', theme: 'Tax', request: { topic: 'Tax', goal: '', level: '', how: '', minutes: 15 },
    squares: [{ key: 's1', format: 'lesson', title: 'Basis', focus: 'Basis of property', unit: 'U1' }, { key: 's2', format: 'quiz', title: 'Final quiz', focus: 'All', unit: 'U1', checkpoint: true }],
    content: {}, progress: { s1: { stars: 3 } }, createdAt: 1, sources: [], projectId: project.id }] });
  const view = rtl.render(React.createElement(TopicBoardScreen));
  rtl.fireEvent.press(view.getByTestId('course-tools-toggle'));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('exam-match-REG')); });
  await rtl.waitFor(() => expect(view.getByTestId('exam-match-result')).toBeTruthy());
  expect(view.getByText(/Not in your books/)).toBeTruthy();
  expect(view.getByText('• Circular 230 and preparer rules')).toBeTruthy();
  expect(view.queryByText('• Basis')).toBeNull();
  expect(view.getByText('• Capital gains and losses')).toBeTruthy(); // in the books, not on the board yet
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('exam-match-add')); });
  const course = useTopics.getState().courses[0];
  expect(course.squares.map((s: { title: string }) => s.title)).toContain('Capital gains and losses');
  expect(course.squares[course.squares.length - 1].title).toBe('Final quiz');
  await rtl.waitFor(() => expect(view.queryByText('• Capital gains and losses')).toBeNull());
});
