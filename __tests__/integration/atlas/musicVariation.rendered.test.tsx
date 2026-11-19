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
  expect(view.getByTestId('music-variation-a')).toBeTruthy();
  expect(view.queryByTestId('music-variation-r')).toBeNull();
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('music-variation-a')); });
  await rtl.waitFor(() => expect(useMusicLibrary.getState().tracks.length).toBe(3), { timeout: 30000 });
  expect(useMusicLibrary.getState().tracks.some((t: { title: string }) => /variation|jazz/i.test(t.title) || t.title !== 'Tune A' && t.title !== 'Rain')).toBe(true);
  expect(alert).toHaveBeenCalledWith('Made with the built-in composer', expect.stringContaining('could not write a variation'));
}, 60000);
