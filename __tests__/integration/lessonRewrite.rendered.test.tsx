/** "This is unclear" on a lesson: the lesson is written again the way asked, and the new one is shown (not the old one handed back). Only the AI is faked. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockAsked: string[] = [];
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async (_system: string, user: string) => {
    mockAsked.push(user);
    const n = mockAsked.length;
    return JSON.stringify({ sections: [{ heading: 'H', text: `Version ${n} of the lesson.` }], keyPoints: ['k'] });
  }),
  gatherSources: jest.fn(async () => []),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { courseId: (global as any).__courseId, key: 's1' } }),
}));

it('writes the lesson again, simpler, and shows the new one', async () => {
  installNativeBoundary({ fs: true });
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true });
  const rtl = requireRTL();
  const React = require('react');
  const { useTopics } = require('../../src/topics/store');
  const { TopicSquareScreen } = require('../../src/topics/TopicScreens');
  const plan = { title: 'C', summary: '', style: '', theme: '', squares: [{ key: 's1', format: 'lesson', title: 'Leases', focus: 'about leases', unit: 'U' }] };
  (global as any).__courseId = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 }, plan);
  const view = rtl.render(React.createElement(TopicSquareScreen));
  await rtl.waitFor(() => expect(view.getByText('Version 1 of the lesson.')).toBeTruthy());
  rtl.fireEvent.press(view.getByTestId('square-rewrite-simpler'));
  await rtl.waitFor(() => expect(view.getByText('Version 2 of the lesson.')).toBeTruthy());
  expect(mockAsked[1]).toMatch(/simpler words/);
  expect(mockAsked[0]).not.toMatch(/simpler words/);
});
