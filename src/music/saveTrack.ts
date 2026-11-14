/**
 * Turns a tune into a saved track: the sound as a WAV and the score beside it, then an entry in the music library. Shared by the Music
 * Studio screen and the chat's make_music tool, so a tune made either way is found in the same place.
 */
import RNFS from 'react-native-fs';
import { wavBytes, toBase64 } from '../atlasVoice/jingles';
import { MUSIC_RATE, renderMusic, type MusicMood, type MusicScore } from './composition';
import { useMusicLibrary, type InstrumentalTrack } from './library';

export async function saveInstrumental(score: MusicScore, o: { mood: MusicMood; seconds: number; /** Who wrote it, kept in the score file. */ by?: string }): Promise<InstrumentalTrack> {
  const pcm = renderMusic(score, { preset: 'band', seconds: o.seconds });
  const dir = `${RNFS.DocumentDirectoryPath}/atlas-compositions`;
  await RNFS.mkdir(dir);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${dir}/instrumental-${id}.wav`;
  const scorePath = `${dir}/instrumental-${id}.json`;
  try {
    await RNFS.writeFile(path, toBase64(wavBytes(pcm, MUSIC_RATE)), 'base64');
    await RNFS.writeFile(scorePath, JSON.stringify({ ...score, mood: o.mood, sound: 'band', duration: o.seconds, by: o.by ?? 'built-in composer' }, null, 2), 'utf8');
  } catch (error) {
    await RNFS.unlink(path).catch(() => undefined);
    await RNFS.unlink(scorePath).catch(() => undefined);
    throw error;
  }
  const track: InstrumentalTrack = { id, title: score.title, path, scorePath, mood: o.mood, sound: 'band', seconds: o.seconds, createdAt: new Date().toISOString() };
  useMusicLibrary.getState().addTrack(track);
  return track;
}
