/**
 * Music Studio: one panel with drop-downs (who makes it, style, how lively, how long, the sound, the instruments) and one button. The style is
 * picked from your words, the page says which instruments play (jazz has a piano), and Another version makes a different tune.
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


/** Opens a drop-down and picks one option. */
const choose = (rtl: any, view: any, select: string, option: string) => { rtl.fireEvent.press(view.getByTestId(select)); rtl.fireEvent.press(view.getByTestId(`${select}-${option}`)); };

it('has a Style drop-down with every style, and no instrument or AI clutter beside the panel', () => {
  const { rtl, view } = open();
  rtl.fireEvent.press(view.getByTestId('music-style'));
  for (const id of ['focus', 'jazz', 'lofi', 'classical', 'cinematic', 'halloween', '1920s']) expect(view.queryByTestId(`music-style-${id}`)).not.toBeNull();
  expect(view.queryByText('Instrument sound')).toBeNull();
  expect(view.queryByText('Compose with local AI')).toBeNull();
});

it('picks the style from your words, says jazz has a piano, and makes a track and another version', async () => {
  const { rtl, view, library } = open();
  library.setState({ tracks: [] });
  rtl.fireEvent.changeText(view.getByTestId('music-prompt'), 'a rainy day jazz cafe');
  expect(view.getByTestId('music-plays').props.children.join('')).toMatch(/Jazz plays: piano, bass, saxophone, vibraphone, muted trumpet, swing drums/);
  choose(rtl, view, 'music-maker', 'quick');
  choose(rtl, view, 'music-length', '30');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('music-quick')); });
  await rtl.waitFor(() => expect(library.getState().tracks).toHaveLength(1), { timeout: 20000 });
  expect(library.getState().tracks[0]).toMatchObject({ mood: 'jazz', sound: 'band', seconds: 30 });
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('music-another')); });
  await rtl.waitFor(() => expect(library.getState().tracks).toHaveLength(2), { timeout: 20000 });
}, 60000);

it('starts as the AI composer with one clear button, and the Made by drop-down offers a no-AI quick tune and background noise', () => {
  const { rtl, view } = open();
  expect(view.getByText('What should the AI composer write?')).toBeTruthy();
  expect(view.getByText('Compose with AI')).toBeTruthy();
  expect(view.queryByText('Ask the AI composer')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('music-maker'));
  expect(view.getByText('Quick tune (no AI)')).toBeTruthy();
  expect(view.getByText('Background noise')).toBeTruthy();
});

it('lets the instruments be chosen for the AI composer, and puts the choice in what the composer is told', () => {
  const { rtl, view } = open();
  expect(view.getByText('Let the composer choose')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('music-instruments'));
  rtl.fireEvent.press(view.getByTestId('music-instruments-flute'));
  rtl.fireEvent.press(view.getByTestId('music-instruments-cello'));
  rtl.fireEvent.press(view.getByTestId('music-instruments-done'));
  expect(view.getByText('Flute, Cello')).toBeTruthy();
  const { composerBrief } = require('../../../src/music/composerAgent');
  expect(composerBrief('x', 'focus', { seconds: 60, instruments: ['flute', 'cello'] }).text).toContain('The person chose these instruments: Flute, Cello.');
});

it('switches to a list of noises with "Background noise", and makes a looping sound such as white noise and plays it', async () => {
  const { rtl, view, library } = open();
  library.setState({ tracks: [], loop: false });
  choose(rtl, view, 'music-maker', 'noise');
  expect(view.queryByTestId('music-prompt')).toBeNull(); // no words, style or instruments for a noise
  choose(rtl, view, 'music-noise', 'white');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('music-noise-make')); });
  await rtl.waitFor(() => expect(library.getState().tracks).toHaveLength(1), { timeout: 30000 });
  expect(library.getState().tracks[0]).toMatchObject({ title: 'White noise', mood: 'ambient', seconds: 90 });
  expect(library.getState().loop).toBe(true);
}, 60000);
