/** Music Studio lists the styles in three groups, and choosing one picks the instrument sound that suits it. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

it('shows holidays and places as their own groups and sets a fitting sound when one is chosen', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { MusicStudioScreen } = require('../../../src/screens/MusicStudioScreen');
  const view = rtl.render(React.createElement(MusicStudioScreen));
  for (const title of ['Moods and genres', 'Seasons and holidays', 'Places and settings']) expect(view.getByText(title)).toBeTruthy();
  for (const label of ['Jazz', 'Vaporwave', 'Thanksgiving', 'Halloween', 'Cinco de Mayo', 'Italian restaurant']) expect(view.getByText(label)).toBeTruthy();
  rtl.fireEvent.press(view.getByText('Christmas'));
  const selected = view.getAllByRole('radio').filter((r: any) => r.props.accessibilityState?.selected);
  expect(selected.some((r: any) => rtl.within(r).queryByText('Bells'))).toBe(true);
  rtl.fireEvent.press(view.getByText('Jazz'));
  expect(view.getAllByRole('radio').filter((r: any) => r.props.accessibilityState?.selected).some((r: any) => rtl.within(r).queryByText('Soft keys'))).toBe(true);
});
