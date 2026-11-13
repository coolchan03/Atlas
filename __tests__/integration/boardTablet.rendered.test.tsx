/** On a tablet the course board and the square you play sit side by side; on a phone a square opens its own screen. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), replace: jest.fn() }),
  useRoute: () => ({ params: { courseId: 'c1' } }),
}));

const course = { id: 'c1', topic: 'Algebra', title: 'Algebra basics', summary: '', style: '', theme: 'Algebra', request: { topic: 'Algebra', goal: '', level: 'x', how: '', minutes: 10 },
  squares: [{ key: 's1', format: 'lesson', title: 'Variables', focus: 'x', unit: 'U' }, { key: 's2', format: 'lesson', title: 'Equations', focus: 'x', unit: 'U' }],
  content: { s1: { kind: 'lesson', sections: [{ heading: 'What a variable is', text: 'A letter that stands for a number.' }], keyPoints: ['A variable is a placeholder'] } },
  progress: {}, createdAt: 1, sources: [] };

function board(width: number) {
  installNativeBoundary({ fs: true });
  mockNavigate.mockClear();
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });
  const rtl = requireRTL();
  const React = require('react');
  require('../../src/topics/store').useTopics.setState({ courses: [course] });
  const { TopicBoardScreen } = require('../../src/topics/TopicScreens');
  return { rtl, view: rtl.render(React.createElement(TopicBoardScreen)) };
}

it('plays a square in the right-hand pane on a tablet', () => {
  const { rtl, view } = board(1000);
  expect(view.getByText('Pick a square on the board to play it here.')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('board-take-turn'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(view.getByText('A letter that stands for a number.')).toBeTruthy();
});

it('opens a square on its own screen on a phone', () => {
  const { rtl, view } = board(400);
  expect(view.queryByTestId('board-detail-pane')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('board-take-turn'));
  expect(mockNavigate).toHaveBeenCalledWith('TopicSquare', { courseId: 'c1', key: 's1' });
});
