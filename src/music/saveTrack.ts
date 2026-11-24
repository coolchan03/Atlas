/**
 * Turns a tune into a saved track: the sound as a WAV and the score beside it, then an entry in the music library. Shared by the Music
 * Studio screen and the chat's make_music tool, so a tune made either way is found in the same place.
 */
import RNFS from 'react-native-fs';
import { wavBytes, toBase64 } from '../atlasVoice/jingles';
import { MUSIC_RATE, renderMusic, type MusicMood, type MusicScore } from './composition';
import { useMusicLibrary, type InstrumentalTrack } from './library';
import { prepareInstruments } from './soundfontFiles';
import { AMBIENT, AMBIENT_RATE, makeAmbient, type AmbientKind } from './ambient';

/** How long a score plays, in whole seconds (a little past its last note): the length to render a tune whose length is not chosen. */
export const scoreSeconds = (s: MusicScore): number => Math.min(300, Math.max(10, Math.ceil(Math.max(...s.notes.map((n) => n.beat + n.length)) * 60 / (s.bpm || 100)) + 2));

/** Lets the screen repaint between the slow steps of making a track, so the person sees what is happening. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

export async function saveInstrumental(score: MusicScore, o: { mood: MusicMood; seconds: number; /** Who wrote it, kept in the score file. */ by?: string; /** Told what is being done, in words, as each step starts. */ onStep?: (message: string) => void }): Promise<InstrumentalTrack> {
  const step = async (message: string) => { o.onStep?.(message); await breathe(); };
  await step('Getting the instruments ready...');
  const sound = await prepareInstruments();
  await step(`Playing all ${score.notes.length} notes into a recording on ${sound.note} (a few seconds)...`);
  const pcm = renderMusic(score, { preset: 'band', seconds: o.seconds });
  await step('Saving the recording to this phone...');
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

/** Makes a background sound (white noise, rain...) and keeps it in the same library as the tunes, so it plays, loops and is shared the same way. */
export async function saveAmbient(kind: AmbientKind, seconds: number, onStep?: (message: string) => void): Promise<InstrumentalTrack> {
  const label = AMBIENT.find((a) => a.id === kind)?.label ?? kind;
  onStep?.(`Making ${label.toLowerCase()} (${seconds} seconds)...`);
  await breathe();
  const pcm = makeAmbient(kind, seconds);
  const dir = `${RNFS.DocumentDirectoryPath}/atlas-compositions`;
  await RNFS.mkdir(dir);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${dir}/instrumental-${id}.wav`;
  const scorePath = `${dir}/instrumental-${id}.json`;
  try {
    await RNFS.writeFile(path, toBase64(wavBytes(pcm, AMBIENT_RATE)), 'base64');
    await RNFS.writeFile(scorePath, JSON.stringify({ title: label, ambient: kind, duration: seconds }, null, 2), 'utf8');
  } catch (error) {
    await RNFS.unlink(path).catch(() => undefined);
    await RNFS.unlink(scorePath).catch(() => undefined);
    throw error;
  }
  const track: InstrumentalTrack = { id, title: label, path, scorePath, mood: 'ambient' as MusicMood, sound: 'band', seconds, createdAt: new Date().toISOString() };
  useMusicLibrary.getState().addTrack(track);
  return track;
}
