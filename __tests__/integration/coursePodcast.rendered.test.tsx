/** "Make a podcast from this course": a lecture from the lessons already written. Fakes only the AI. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockPrompts: { system: string; user: string }[] = [];
const mockNavigate = jest.fn();
jest.mock('../../src/atlasTools/models', () => ({ ensureTextModel: async () => undefined }));
jest.mock('../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));
jest.mock('../../src/services/llm', () => ({
  llmService: {
    getPerformanceSettings: () => ({ contextLength: 4096 }),
    getPerformanceStats: () => ({ lastTokensPerSecond: 0 }),
    generateResponse: async (msgs: { role: string; content: string }[]) => {
      const system = msgs[0].content; const user = msgs[1].content;
      mockPrompts.push({ system, user });
      if (/plan podcast/i.test(system)) return `TITLE: Water, explained\n${[...user.matchAll(/SEGMENT (\d+):/g)].map((m) => `SEGMENT ${m[1]}: idea ${m[1]}`).join('\n')}`;
      return 'A: Today we cover how water is made safe to drink.\nA: First, boiling kills germs.\nA: So far: boil it first.\nA: Next, filters.';
    },
  },
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: { courseId: (global as any).__courseId } }),
}));

it('a course becomes a lecture podcast from its written lessons, then opens in the player', async () => {
  installNativeBoundary({ fs: true });
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true });
  const rtl = requireRTL();
  const React = require('react');
  const { useTopics } = require('../../src/topics/store');
  const plan = { title: 'Safe water', summary: '', style: '', theme: '', squares: [1, 2].map((i) => ({ key: `s${i}`, format: 'lesson', title: `Lesson ${i}`, focus: `about ${i}`, unit: 'U' })) };
  const id = useTopics.getState().add({ topic: 'Water', goal: '', level: 'Complete beginner', how: '', minutes: 10 }, plan);
  useTopics.getState().setPrepareAhead(id, 0);
  useTopics.getState().setContent(id, 's1', { kind: 'lesson', sections: [{ heading: 'Boiling', text: 'Boiling water for one minute kills germs.' }], keyPoints: ['Boil first'] });
  (global as any).__courseId = id;
  const { TopicBoardScreen } = require('../../src/topics/TopicScreens');
  const view = rtl.render(React.createElement(TopicBoardScreen));

  expect(view.getByText(/Uses the 1 lesson written so far/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('course-podcast-open'));
  rtl.fireEvent.press(await view.findByTestId('podcast-format-lecture'));
  rtl.fireEvent.press(view.getByTestId('podcast-minutes-3'));
  rtl.fireEvent.press(view.getByTestId('course-podcast-make'));

  await rtl.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Study', expect.objectContaining({ projectId: `course-podcast:${id}` })), { timeout: 8000 });
  const { useStudyStore } = require('../../src/study/store');
  const [episode] = useStudyStore.getState().saved[`course-podcast:${id}`];
  expect(episode.kind).toBe('podcast');
  expect(episode.hosts).toBe(1); // a lecture is one teacher
  expect(episode.title).toBe('Safe water');
  // The lesson's own words were what the writer was given.
  expect(mockPrompts.some((p) => /Boiling water for one minute kills germs/.test(p.user))).toBe(true);
}, 30000);
