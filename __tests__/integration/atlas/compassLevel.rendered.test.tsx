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
  rtl.fireEvent.press(view.getByTestId('compass-level-toggle'));
  expect(view.getByTestId('compass-level-view')).toBeTruthy();
  expect(view.getByText('Orientation sensor unavailable')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('compass-level-toggle'));
  expect(view.queryByTestId('compass-level-view')).toBeNull();
});
