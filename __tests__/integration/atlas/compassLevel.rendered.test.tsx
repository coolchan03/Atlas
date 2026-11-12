/**
 * The Compass screen switches to a bubble level and back. Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

it('shows the level when asked, and the compass again after switching back', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { CompassScreen } = require('../../../src/screens/CompassScreen');

  const view = rtl.render(React.createElement(CompassScreen));
  expect(view.queryByTestId('compass-level-view')).toBeNull();
  expect(view.getByTestId('compass-dial')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('compass-level-toggle'));
  expect(view.getByTestId('compass-level-view')).toBeTruthy();
  expect(view.getByText('Orientation sensor unavailable')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('compass-level-toggle'));
  expect(view.queryByTestId('compass-level-view')).toBeNull();
});

it('shows the signed angle the phone leans, and the dots switch pages like the old iOS compass', () => {
  installNativeBoundary({ fs: true });
  const { signedTilt } = require('../../../src/screens/compass/LevelView');
  expect(signedTilt({ pitch: 5, roll: -36, tilt: 36.4 })).toBeLessThan(0);
  expect(signedTilt({ pitch: 5, roll: 36, tilt: 36.4 })).toBeGreaterThan(0);
  const rtl = requireRTL();
  const React = require('react');
  const { CompassScreen } = require('../../../src/screens/CompassScreen');
  const view = rtl.render(React.createElement(CompassScreen));
  rtl.fireEvent.press(view.getByLabelText('Show the level'));
  expect(view.getByTestId('compass-level-view')).toBeTruthy();
  rtl.fireEvent.press(view.getByLabelText('Show the compass'));
  expect(view.getByTestId('compass-dial')).toBeTruthy();
});
