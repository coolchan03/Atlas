/**
 * Music Studio is simple: say what you want (optional), pick a style, how lively and how long, press Make music. The style is picked
 * from your words, the page says which instruments play (jazz has a piano), and Another version makes a different tune.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

function open() {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
  const { MusicStudioScreen } = require('../../../src/screens/MusicStudioScreen');
  const { instrumentalPlayer } = require('../../../src/music/backgroundPlayer');
  jest.spyOn(instrumentalPlayer, 'play').mockResolvedValue(undefined);
  return { rtl, view: rtl.render(React.createElement(MusicStudioScreen)), library: require('../../../src/music/library').useMusicLibrary };
}

it('shows a short list of styles first, the rest under More styles, and no instrument or AI options', () => {
  const { rtl, view } = open();
  for (const label of ['Focus', 'Jazz', 'Lo-fi chill', 'Classical', 'Cinematic']) expect(view.getByText(label)).toBeTruthy();
  expect(view.queryByText('Halloween')).toBeNull();
  expect(view.queryByText('Instrument sound')).toBeNull();
  expect(view.queryByText('Compose with local AI')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('music-more-styles'));
  for (const title of ['Eras and genres', 'Seasons and holidays', 'Places and settings']) expect(view.getByText(title)).toBeTruthy();
  for (const label of ['Halloween', 'Cinco de Mayo', 'Italian restaurant', '1920s']) expect(view.getByText(label)).toBeTruthy();
});

it('picks the style from your words, says jazz has a piano, and makes a track and another version', async () => {
  const { rtl, view, library } = open();
  library.setState({ tracks: [] });
  rtl.fireEvent.changeText(view.getByTestId('music-prompt'), 'a rainy day jazz cafe');
  expect(view.getByTestId('music-plays').props.children.join('')).toMatch(/Jazz plays: piano, bass, swing drums/);
  rtl.fireEvent.press(view.getByText('30 seconds'));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('music-quick')); });
  await rtl.waitFor(() => expect(library.getState().tracks).toHaveLength(1), { timeout: 20000 });
  expect(library.getState().tracks[0]).toMatchObject({ mood: 'jazz', sound: 'band', seconds: 30 });
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('music-another')); });
  await rtl.waitFor(() => expect(library.getState().tracks).toHaveLength(2), { timeout: 20000 });
}, 60000);
