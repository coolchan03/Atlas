/** The Continue learning suggestion on Home goes away when it is pressed and held (after a confirm) or swiped sideways, and a link brings it back. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
}));

function open() {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { useTopics } = require('../../src/topics/store');
  const { useHomeHidden } = require('../../src/screens/HomeScreen/homeHidden');
  useHomeHidden.setState({ hidden: [] });
  useTopics.setState({ courses: [{
    id: 'c1', topic: 'Accounting', title: 'Accounting', summary: '', style: '', theme: '', request: {}, createdAt: 1, lastPlayedAt: 5, sources: [], content: {}, progress: { s1: { stars: 3 } },
    squares: [{ key: 's1', format: 'lesson', title: 'Cash', focus: '', unit: 'U' }, { key: 's2', format: 'quiz', title: 'Cash quiz', focus: '', unit: 'U' }],
  }] });
  const { HomeStudyCard } = require('../../src/screens/HomeScreen/HomeStudyCard');
  const view = rtl.render(React.createElement(HomeStudyCard, { navigation: { getParent: () => ({ navigate: jest.fn() }) } }));
  return { rtl, view, useHomeHidden };
}

it('press and hold asks, then hides the suggestion; the small link brings it back', () => {
  const { rtl, view, useHomeHidden } = open();
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
  expect(view.getByTestId('home-continue')).toBeTruthy();
  rtl.fireEvent(view.getByTestId('home-continue'), 'longPress');
  expect(alert).toHaveBeenCalledWith('Hide “Continue learning”?', expect.any(String), expect.any(Array));
  expect(useHomeHidden.getState().hidden).toEqual([]); // nothing is hidden until it is confirmed
  rtl.act(() => { (alert.mock.calls[0][2] as any[]).find((b) => b.text === 'Hide').onPress(); });
  expect(view.queryByTestId('home-continue')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('home-continue-show'));
  expect(view.getByTestId('home-continue')).toBeTruthy();
});

it('a swipe sideways hides it at once, and a short drag does not', () => {
  const { rtl, view } = open();
  const row = view.getByTestId('home-continue');
  rtl.fireEvent(row, 'touchStart', { nativeEvent: { pageX: 300, pageY: 200 } });
  rtl.fireEvent(row, 'touchEnd', { nativeEvent: { pageX: 280, pageY: 205 } });
  expect(view.getByTestId('home-continue')).toBeTruthy();
  rtl.fireEvent(row, 'touchStart', { nativeEvent: { pageX: 300, pageY: 200 } });
  rtl.fireEvent(row, 'touchEnd', { nativeEvent: { pageX: 80, pageY: 205 } });
  expect(view.queryByTestId('home-continue')).toBeNull();
});
