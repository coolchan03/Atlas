/** A saved tune gets a "Variation" button (a background sound does not); pressing it makes a new track beside the first. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

it('offers a variation of a tune only, and saves the new tune next to the original', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
  const RNFS = require('react-native-fs');
  const { MusicStudioScreen } = require('../../../src/screens/MusicStudioScreen');
  const { instrumentalPlayer } = require('../../../src/music/backgroundPlayer');
  const { useMusicLibrary } = require('../../../src/music/library');
  jest.spyOn(instrumentalPlayer, 'play').mockResolvedValue(undefined);
  const dir = `${RNFS.DocumentDirectoryPath}/atlas-compositions`;
  const notes = Array.from({ length: 16 }, (_, i) => ({ pitch: 60 + (i % 5), beat: i, length: 1, gain: 0.5, role: i % 4 === 0 ? 'bass' : 'melody' }));
  await RNFS.mkdir(dir);
  await RNFS.writeFile(`${dir}/instrumental-a.json`, JSON.stringify({ title: 'Tune A', bpm: 90, notes, mood: 'jazz' }), 'utf8');
  const track = (id: string, title: string, mood: string) => ({ id, title, path: `${dir}/instrumental-${id}.wav`, scorePath: `${dir}/instrumental-${id}.json`, mood, sound: 'band', seconds: 30, createdAt: new Date().toISOString() });
  useMusicLibrary.setState({ tracks: [track('a', 'Tune A', 'jazz'), track('r', 'Rain', 'ambient')] });
  const view = rtl.render(React.createElement(MusicStudioScreen));
  // Press and hold a tune: a sheet lists what can be done with it, as buttons (nothing happens by holding alone).
  rtl.fireEvent(view.getByTestId('music-track-a'), 'longPress');
  expect(view.getByTestId('sheet-action-variation')).toBeTruthy();
  expect(view.getByTestId('sheet-action-continue')).toBeTruthy();
  expect(view.getByTestId('sheet-action-delete')).toBeTruthy();
  rtl.act(() => { rtl.fireEvent.press(view.getByTestId('sheet-cancel')); });
  rtl.fireEvent(view.getByTestId('music-track-r'), 'longPress');
  expect(view.queryByTestId('sheet-action-variation')).toBeNull(); // a background sound cannot be varied
  expect(view.getByTestId('sheet-action-delete')).toBeTruthy();
  rtl.act(() => { rtl.fireEvent.press(view.getByTestId('sheet-cancel')); });
  expect(useMusicLibrary.getState().tracks).toHaveLength(2);
  rtl.fireEvent(view.getByTestId('music-track-a'), 'longPress');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('sheet-action-variation')); });
  await rtl.waitFor(() => expect(useMusicLibrary.getState().tracks.length).toBe(3), { timeout: 30000 });
  expect(useMusicLibrary.getState().tracks.some((t: { title: string }) => /variation|jazz/i.test(t.title) || t.title !== 'Tune A' && t.title !== 'Rain')).toBe(true);
  expect(alert).toHaveBeenCalledWith('Made with the built-in composer', expect.stringContaining('could not write a variation'));
}, 60000);

it('offers Continue and Import MIDI, and says why a tune could not be continued', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
  const RNFS = require('react-native-fs');
  const { MusicStudioScreen } = require('../../../src/screens/MusicStudioScreen');
  const { useMusicLibrary } = require('../../../src/music/library');
  const dir = `${RNFS.DocumentDirectoryPath}/atlas-compositions`;
  await RNFS.mkdir(dir);
  const notes = Array.from({ length: 32 }, (_, bar) => ({ pitch: 48, beat: bar * 4, length: 4, gain: 0.5, role: 'bass' }));
  await RNFS.writeFile(`${dir}/instrumental-long.json`, JSON.stringify({ title: 'Long', bpm: 90, notes, mood: 'jazz' }), 'utf8');
  useMusicLibrary.setState({ tracks: [{ id: 'long', title: 'Long', path: `${dir}/instrumental-long.wav`, scorePath: `${dir}/instrumental-long.json`, mood: 'jazz', sound: 'band', seconds: 30, createdAt: new Date().toISOString() }] });
  const view = rtl.render(React.createElement(MusicStudioScreen));
  expect(view.getByTestId('music-import-midi')).toBeTruthy();
  rtl.fireEvent(view.getByTestId('music-track-long'), 'longPress');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('sheet-action-continue')); });
  await rtl.waitFor(() => expect(alert).toHaveBeenCalledWith('Could not extend the tune', expect.stringContaining('already as long')));
  expect(useMusicLibrary.getState().tracks).toHaveLength(1);
}, 60000);
