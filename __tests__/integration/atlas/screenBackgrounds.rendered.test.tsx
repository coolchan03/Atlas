/**
 * A background chosen in Background settings shows up on that screen, and the settings list offers
 * only screens that can show one. Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

const URI = 'file:///atlas/background.png';

it('shows the chosen picture on the Learning screen', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { Image } = require('react-native');
  const { useAppStore } = require('../../../src/stores/appStore');
  const { LearningScreen } = require('../../../src/screens/LearningScreen');
  useAppStore.getState().updateSettings({ screenBackgrounds: { Learning: { uri: URI, blur: 0, dim: 0 } } });
  const view = rtl.render(React.createElement(LearningScreen));
  expect(view.UNSAFE_getAllByType(Image).some((i: any) => i.props.source?.uri === URI)).toBe(true);
});

it('lists the screens that show a background, and not Maps', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { BackgroundSettingsScreen } = require('../../../src/screens/BackgroundSettingsScreen');
  const view = rtl.render(React.createElement(BackgroundSettingsScreen));
  for (const label of ['Home screen', 'Compass', 'Settings', 'Learning', 'Daily briefing', 'Metal detector', 'Noise meter', 'Step counter']) {
    expect(view.getByText(label)).toBeTruthy();
  }
  expect(view.queryByText('Maps')).toBeNull();
});
