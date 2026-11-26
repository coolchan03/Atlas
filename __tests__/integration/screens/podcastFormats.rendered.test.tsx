import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { seedApp } from '../../harness/monkeySeed';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
let mockParams: Record<string, unknown> = {};
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useFocusEffect: (cb: () => void) => require('react').useEffect(cb, []) }));

it('the podcast options let a person pick a format and any length, and show what that means', async () => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const ids = seedApp('full');
  mockParams = { projectId: ids.project };
  const { StudyScreen } = require('../../../src/screens/StudyScreen');
  const view = rtl.render(React.createElement(StudyScreen));

  rtl.fireEvent.press(await view.findByTestId('study-kind-podcast'));
  // Formats beyond the old style list are there, each with a one-line description.
  rtl.fireEvent.press(await view.findByTestId('podcast-format-lecture'));
  expect(view.getByTestId('podcast-format-blurb').props.children).toMatch(/One teacher/);
  expect(view.getByTestId('podcast-format-entertaining')).toBeTruthy();
  expect(view.getByTestId('podcast-format-story')).toBeTruthy();

  // A length that is not one of the quick picks: typed, then read back as parts, words and a time to write it.
  const minutes = view.getByTestId('podcast-minutes');
  rtl.fireEvent.changeText(minutes, '12');
  rtl.fireEvent(minutes, 'blur');
  expect(view.getByTestId('podcast-length-note').props.children.join('')).toMatch(/8 parts, around 1,860 spoken words/);

  // Out-of-range input is brought back into range instead of reaching the writer.
  rtl.fireEvent.changeText(minutes, '99');
  rtl.fireEvent(minutes, 'blur');
  expect(view.getByTestId('podcast-minutes').props.value).toBe('90');
  rtl.fireEvent.press(view.getByTestId('podcast-minutes-down'));
  expect(view.getByTestId('podcast-minutes').props.value).toBe('89');
}, 30000);
