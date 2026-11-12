/**
 * Home widgets open what they say: screen widgets go to their screen, resume widgets say when there is no chat,
 * and a chat widget that points at a model that is not installed explains why it will not start.
 * Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const mockNavigate = jest.fn();
const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: mockNavigate }) };

function setup(shortcuts: Array<Record<string, unknown>>) {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { Alert } = require('react-native');
  const { HomeShortcutsCard } = require('../../../src/screens/HomeScreen/HomeShortcutsCard');
  const { useHomeShortcuts } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  useHomeShortcuts.setState({ shortcuts: [] });
  const ids = shortcuts.map((s) => useHomeShortcuts.getState().addShortcut(s).id);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = rtl.render(React.createElement(HomeShortcutsCard, { navigation }));
  return { rtl, view, ids, alert };
}

beforeEach(() => { mockNavigate.mockClear(); });

it('opens the screen a widget is set to open', () => {
  const { rtl, view, ids } = setup([{ title: 'Level', action: 'compass' }, { title: 'Music', action: 'music-studio' }]);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('Compass', undefined);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[1]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('MusicStudio', undefined);
});

it('says so when a resume widget has no chat to resume', async () => {
  const { rtl, view, ids, alert } = setup([{ title: 'Resume', action: 'resume-last' }]);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  await rtl.waitFor(() => expect(alert).toHaveBeenCalledWith('No available chat', expect.any(String)));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('explains why a chat widget with a missing model does not start', async () => {
  const { rtl, view, ids, alert } = setup([{ title: 'Old model', action: 'chat', modelId: 'not-installed' }]);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  await rtl.waitFor(() => expect(alert).toHaveBeenCalledWith('Model missing', expect.any(String)));
  expect(mockNavigate).not.toHaveBeenCalled();
});
