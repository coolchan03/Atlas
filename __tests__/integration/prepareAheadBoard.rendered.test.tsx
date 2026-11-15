/** The board's "Write the next lessons ahead" choice, and what it says while it works. Fakes only the AI. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockGates: Array<() => void> = [];
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async () => { await new Promise<void>((r) => { mockGates.push(r); }); return JSON.stringify({ sections: [{ heading: 'h', text: 't' }], keyPoints: ['k'] }); }),
  gatherSources: jest.fn(async () => []),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { courseId: (global as any).__courseId } }),
}));

it('writes ahead as the board opens, shows which lesson, and the choice turns it off or changes how many', async () => {
  installNativeBoundary({ fs: true });
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true }); // no web lookup in this test
  const rtl = requireRTL();
  const React = require('react');
  const { useTopics } = require('../../src/topics/store');
  const plan = { title: 'Course', summary: '', style: '', theme: '', squares: [1, 2, 3, 4].map((i) => ({ key: `s${i}`, format: 'lesson', title: `Lesson ${i}`, focus: `about ${i}`, unit: 'U' })) };
  const id = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 }, plan);
  (global as any).__courseId = id;
  const { TopicBoardScreen } = require('../../src/topics/TopicScreens');
  const view = rtl.render(React.createElement(TopicBoardScreen));
  await rtl.waitFor(() => expect(view.getByTestId('course-ahead-status')).toBeTruthy());
  expect(view.getByText(/Writing "Lesson 1" \(1 of 2\)/)).toBeTruthy();
  await rtl.act(async () => { mockGates.shift()?.(); await new Promise((r) => setTimeout(r, 20)); });
  await rtl.waitFor(() => expect(view.getByText(/Writing "Lesson 2" \(2 of 2\)/)).toBeTruthy());
  await rtl.act(async () => { mockGates.shift()?.(); await new Promise((r) => setTimeout(r, 20)); });
  await rtl.waitFor(() => expect(view.queryByTestId('course-ahead-status')).toBeNull());
  expect(Object.keys(useTopics.getState().courses[0].content)).toEqual(['s1', 's2']);
  rtl.fireEvent.press(view.getByTestId('course-ahead-0'));
  expect(useTopics.getState().courses[0].prepareAhead).toBe(0);
  rtl.fireEvent.press(view.getByTestId('course-ahead-3'));
  expect(useTopics.getState().courses[0].prepareAhead).toBe(3);
  await rtl.waitFor(() => expect(view.getByText(/Writing "Lesson 3" \(3 of 3\)/)).toBeTruthy());
  await rtl.act(async () => { mockGates.shift()?.(); await new Promise((r) => setTimeout(r, 20)); });
});
