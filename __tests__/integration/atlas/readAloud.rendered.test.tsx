/**
 * Read aloud: the screen shows the reading state and its buttons act on it, and the Home widget shows the same
 * state and opens the screen. Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(), types: { allFiles: '*/*' }, isErrorWithCode: () => false, errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));

const mockNavigate = jest.fn();

function open(element: string) {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { useReadAloud } = require('../../../src/atlasVoice/readAloud');
  useReadAloud.setState({ status: 'idle', title: '', parts: [], index: 0 });
  const mod = element === 'screen'
    ? React.createElement(require('../../../src/screens/ReadAloudScreen').ReadAloudScreen)
    : React.createElement(require('../../../src/screens/HomeScreen/ReadAloudWidget').ReadAloudWidget, { openReader: mockNavigate });
  return { rtl, view: rtl.render(mod), useReadAloud };
}

beforeEach(() => mockNavigate.mockClear());

it('shows progress while reading and pauses and stops from its buttons', () => {
  const { rtl, view, useReadAloud } = open('screen');
  expect(view.getByText('Ready when you are')).toBeTruthy();
  rtl.act(() => useReadAloud.setState({ status: 'reading', parts: ['One.', 'Two.', 'Three.'], index: 1 }));
  expect(view.getByText('Part 2 of 3')).toBeTruthy();
  expect(view.getByText('Two.')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('read-aloud-pause'));
  expect(useReadAloud.getState().status).toBe('paused');
  rtl.fireEvent.press(view.getByTestId('read-aloud-next'));
  expect(useReadAloud.getState().index).toBe(2);
  rtl.fireEvent.press(view.getByTestId('read-aloud-stop'));
  expect(useReadAloud.getState()).toMatchObject({ status: 'idle', index: 0 });
});

it('shows a typed text with its word count and a Clear button', () => {
  const { rtl, view } = open('screen');
  rtl.fireEvent.changeText(view.getByTestId('read-aloud-text'), 'Boil the water for three minutes before drinking it.');
  expect(view.getByText(/9 words/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('read-aloud-clear'));
  expect(view.queryByText(/9 words/)).toBeNull();
});

it('the Home widget shows the reading state, controls it, and opens the screen', () => {
  const { rtl, view, useReadAloud } = open('widget');
  expect(view.getByText(/Paste text or open a document/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('widget-read-open'));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  rtl.act(() => useReadAloud.setState({ status: 'reading', title: 'Water guide.pdf', parts: ['A.', 'B.'], index: 0 }));
  expect(view.getByText('Water guide.pdf')).toBeTruthy();
  expect(view.getByText('Reading · part 1 of 2')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('widget-read-toggle'));
  expect(useReadAloud.getState().status).toBe('paused');
  rtl.fireEvent.press(view.getByTestId('widget-read-stop'));
  expect(useReadAloud.getState().status).toBe('idle');
});
