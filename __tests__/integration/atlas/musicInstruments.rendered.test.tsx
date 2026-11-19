/** Music Studio says what it is doing, step by step, and shows whether the instruments are real recordings. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

it('shows each step while a track is made, and what the player is doing', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
  const { MusicStudioScreen } = require('../../../src/screens/MusicStudioScreen');
  const { instrumentalPlayer, useMusicPlayback } = require('../../../src/music/backgroundPlayer');
  const { useMusicLibrary } = require('../../../src/music/library');
  useMusicLibrary.setState({ tracks: [] });
  let release!: () => void;
  const hold = new Promise<void>((r) => { release = r; });
  jest.spyOn(instrumentalPlayer, 'play').mockImplementation(async () => { useMusicPlayback.setState({ loading: 'Reading the recording of "x"...' }); await hold; useMusicPlayback.setState({ loading: null, playing: true }); });
  const view = rtl.render(React.createElement(MusicStudioScreen));
  expect(view.getByTestId('music-player-state').props.children).toBe('Stopped');
  const choose = (select: string, option: string) => { rtl.fireEvent.press(view.getByTestId(select)); rtl.fireEvent.press(view.getByTestId(`${select}-${option}`)); };
  choose('music-maker', 'quick');
  choose('music-length', '30');
  const seen = new Set<string>();
  const watch = setInterval(() => { try { const t = view.getByTestId('music-status'); seen.add(JSON.stringify(t.findByType(require('react-native').Text).props.children)); } catch { /* not showing */ } }, 5);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('music-quick')); });
  await rtl.waitFor(() => expect(view.getByText('Starting the player...')).toBeTruthy(), { timeout: 20000 });
  expect(view.getByText('Reading the recording of "x"...')).toBeTruthy(); // the player's own step
  clearInterval(watch);
  expect([...seen].some((s) => /Writing all|Playing all \d+ notes into a recording on the built-in synthesiser/.test(s) || /Saving the recording/.test(s) || /Getting the instruments/.test(s))).toBe(true);
  await rtl.act(async () => { release(); });
}, 60000);

it('says the sound is synthetic until real instruments are added, then which ones are in use', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { SoundfontCard } = require('../../../src/music/SoundfontCard');
  const { useMusicLibrary } = require('../../../src/music/library');
  useMusicLibrary.setState({ soundfont: null, useSoundfont: true });
  const view = rtl.render(React.createElement(SoundfontCard));
  expect(view.getByTestId('music-instruments-state').props.children).toMatch(/Built-in synthesiser: every sound is made by the phone/);
  expect(view.getByTestId('music-sf-download')).toBeTruthy();
  rtl.act(() => { useMusicLibrary.setState({ soundfont: { name: 'TimGM6mb', path: '/x.sf2', bytes: 5994284 } }); });
  expect(view.getByTestId('music-instruments-state').props.children).toMatch(/Real instruments: TimGM6mb \(5\.7 MB\)/);
  rtl.fireEvent.press(view.getByTestId('music-sf-toggle'));
  expect(view.getByTestId('music-instruments-state').props.children).toMatch(/installed but switched off/);
  // The sets stay on offer once one is installed, so another can be switched to.
  expect(view.getByTestId('music-sf-download-generaluser')).toBeTruthy();
  expect(view.getByTestId('music-sf-download-fluidr3')).toBeTruthy();
});
