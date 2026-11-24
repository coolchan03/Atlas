import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));
const mockAsk = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockAsk(...a) }));

const fall = (perHalfHour: number) => Array.from({ length: 7 }, (_, i) => ({ at: Date.now() - (6 - i) * 1_800_000, hpa: 1010 + i * perHalfHour }));

it('shows a storm level worked out from the pressure, words it with the AI only when the words fit, and falls back to fixed advice when they do not', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { StormWatchScreen } = require('../../src/storm/StormWatchScreen');
  const { usePressureLog } = require('../../src/atlasTools/pressureLog');

  usePressureLog.setState({ samples: [{ at: Date.now() - 600_000, hpa: 1010 }] });
  let view = rtl.render(React.createElement(StormWatchScreen));
  expect(view.getByTestId('storm-level').props.children).toBe('Learning');
  expect(view.getByTestId('storm-explain').props.accessibilityState?.disabled).toBe(true);
  view.unmount();

  usePressureLog.setState({ samples: fall(-1.3) }); // about 8 hPa in 3 hours
  view = rtl.render(React.createElement(StormWatchScreen));
  expect(view.getByTestId('storm-level').props.children).toBe('Storm likely');
  expect(view.getByTestId('storm-numbers').props.children).toMatch(/Last 3 hours: -7\./);

  // Words that keep to the numbers and agree with the level are shown, marked as the AI's.
  mockAsk.mockResolvedValueOnce('The pressure has dropped about 8 hPa in three hours, so a storm is likely to arrive soon.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('storm-explain')); });
  expect(mockAsk.mock.calls[0][1]).toMatch(/Risk level: Storm likely/);
  expect(view.getByTestId('storm-words').props.children).toMatch(/storm is likely to arrive soon/);

  // Words that calm a storm warning are thrown away for the fixed advice.
  mockAsk.mockResolvedValueOnce('There is nothing to worry about today, the weather is safe.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('storm-explain')); });
  expect(view.getByTestId('storm-words').props.children).toMatch(/Get to shelter/);

  // A steady pressure is calm, and an AI that invents a number is also replaced.
  view.unmount();
  usePressureLog.setState({ samples: fall(0.05) });
  view = rtl.render(React.createElement(StormWatchScreen));
  expect(view.getByTestId('storm-level').props.children).toBe('Calm');
  mockAsk.mockResolvedValueOnce('The pressure moved 14 hPa and it will rain at 4 pm.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('storm-explain')); });
  expect(view.getByTestId('storm-words').props.children).toMatch(/No sign of a storm/);
});
