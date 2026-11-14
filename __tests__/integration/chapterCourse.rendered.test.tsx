/**
 * A textbook in the project becomes a course with one unit per chapter (lesson, key terms, chapter test) in the book's order, made from the
 * chapter headings with no AI; and the difficulty can be changed on the board. SQLite is the device boundary.
 */
import { installRealSqlite } from '../harness/sqliteFake';
import { requireRTL } from '../harness/nativeBoundary';

const mockNavigate = jest.fn();
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}));

const chapter = (n: number, name: string) => `Chapter ${n}: ${name}\n${`${name} explained in detail with many sentences about the topic. `.repeat(40)}`;

it('makes one unit per chapter with six squares (reading, key terms, worked example, quiz, assignment, chapter exam), in the book\'s order', async () => {
  installRealSqlite();
  const rtl = requireRTL();
  const React = require('react');
  const { ragService } = require('../../src/services/rag');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { useTopics } = require('../../src/topics/store');
  const { TopicsScreen } = require('../../src/topics/TopicScreens');
  const project = useProjectStore.getState().createProject({ name: 'FAR book', description: '', systemPrompt: '', icon: '#10B981' });
  const text = ['Contents', 'Chapter 1: Leases .... 3', 'Chapter 2: Bonds .... 40', 'Chapter 3: Revenue .... 90', chapter(1, 'Leases'), chapter(2, 'Bonds'), chapter(3, 'Revenue')].join('\n');
  await ragService.appendProjectDocuments([{ projectId: project.id, name: 'FAR.pdf', path: '/x', size: 10, enabled: true, createdAt: '2026-01-01', chunks: text.split('\n').map((content, position) => ({ content, position })) }]);
  mockParams = { projectId: project.id };
  useTopics.setState({ courses: [] });
  const view = rtl.render(React.createElement(TopicsScreen));
  rtl.fireEvent.press(view.getByTestId('course-new'));
  expect(view.getByTestId('course-by-chapter').props.accessibilityState.checked).toBe(true);
  rtl.fireEvent.changeText(view.getByTestId('course-topic'), 'Financial accounting');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('course-make')); });
  await rtl.waitFor(() => expect(useTopics.getState().courses).toHaveLength(1));
  const course = useTopics.getState().courses[0];
  const per = (name: string) => [name, `${name}: key terms`, `${name}: worked example`, `${name}: quiz`, `${name}: assignment`, `${name}: chapter exam`];
  expect(course.squares.map((s: { title: string }) => s.title)).toEqual([...per('Chapter 1: Leases'), ...per('Chapter 2: Bonds'), ...per('Chapter 3: Revenue')]);
  expect(course.squares.map((s: { format: string }) => s.format).slice(0, 6)).toEqual(['lesson', 'cards', 'worked', 'quiz', 'practice', 'quiz']);
  expect(course.squares.filter((s: { checkpoint?: boolean }) => s.checkpoint)).toHaveLength(3);
  expect(course.projectId).toBe(project.id);
  expect(course.difficulty).toBe('beginner');
});

it('changes the difficulty on the board and writes the squares not played yet again', () => {
  installRealSqlite();
  const rtl = requireRTL();
  const React = require('react');
  const { useTopics } = require('../../src/topics/store');
  const { TopicBoardScreen } = require('../../src/topics/TopicScreens');
  mockParams = { courseId: 'c1' };
  useTopics.setState({ courses: [{ id: 'c1', topic: 'Algebra', title: 'Algebra', summary: '', style: '', theme: 'Algebra', request: { topic: 'Algebra', goal: '', level: 'Know a little', how: '', minutes: 10 },
    squares: [{ key: 's1', format: 'lesson', title: 'A', focus: 'x', unit: 'U' }, { key: 's2', format: 'lesson', title: 'B', focus: 'x', unit: 'U' }],
    content: { s1: { kind: 'lesson', sections: [], keyPoints: [] }, s2: { kind: 'lesson', sections: [], keyPoints: [] } }, progress: { s1: { stars: 3 } }, createdAt: 1, sources: [], difficulty: 'beginner' }] });
  const view = rtl.render(React.createElement(TopicBoardScreen));
  rtl.fireEvent.press(view.getByTestId('course-difficulty-hard'));
  const course = useTopics.getState().courses[0];
  expect(course.difficulty).toBe('hard');
  expect(Object.keys(course.content)).toEqual(['s1']); // the played square keeps its content; the other is written again at the new level
  expect(view.getByTestId('course-difficulty-hard').props.accessibilityState.selected).toBe(true);
});
