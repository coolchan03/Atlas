/**
 * The briefing (or any podcast) as ONE audio file: every line in its host's voice, with the opening and closing tunes and the quiet
 * between stories, joined in the order they are played. Made from the lines the show already saved, so a show that has been listened
 * to is joined in seconds; lines not saved yet are made first. The file is written in pieces, so a half hour of speech never has to
 * sit in memory at once.
 */
import RNFS from 'react-native-fs';
import { nativeEpisodeQueue, renderEpisode, type CastLine, type NativeEpisodeQueueOpts } from './podcastAudio';
import { fromBase64 } from './wavTrim';
import { monoSamplesAt, samplesToBytes, wavHeader } from './wavJoin';
import { toBase64 } from './jingles';
import { useEpisodeAudio } from './episodeAudioStore';

export interface EpisodeAudio { path: string; seconds: number }
export interface EpisodeAudioOpts {
  title: string;
  tunes?: NativeEpisodeQueueOpts['tunes'];
  jingleVolume?: NativeEpisodeQueueOpts['jingleVolume'];
  /** 'voice' while lines are made (done of total), 'join' while the file is written */
  onProgress?: (stage: 'voice' | 'join', done: number, total: number) => void;
}

const folder = () => `${RNFS.CachesDirectoryPath}/briefing-audio`;
const slug = (title: string) => title.replace(/[^A-Za-z0-9 _-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/ /g, '-') || 'briefing';

/** The rate of a WAV file's header (0 when it is not one). */
const rateOf = (bytes: Uint8Array): number => (bytes.length >= 28 ? (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24)) >>> 0 : 0);

async function readTrack(path: string, rate: number): Promise<Int16Array | null> {
  return monoSamplesAt(fromBase64(await RNFS.readFile(path, 'base64')), rate);
}

export async function exportEpisodeAudio(key: string, items: CastLine[], opts: EpisodeAudioOpts): Promise<EpisodeAudio> {
  const { title, tunes, jingleVolume, onProgress } = opts;
  if (!items.length) throw new Error('There is nothing to save yet.');
  const ready = await renderEpisode(key, items, (done, total) => onProgress?.('voice', done, total));
  if (!ready) throw new Error('Some lines could not be turned into speech on this phone, so the audio file cannot be made.');
  const queue = await nativeEpisodeQueue(key, items, { from: 0, tunes, jingleVolume });
  if (!queue) throw new Error('The saved speech for this show is not all there. Play it once, then try again.');

  const first = fromBase64(await RNFS.readFile(queue.paths.find((p) => !p.includes('/_jingles/')) ?? queue.paths[0], 'base64'));
  const rate = rateOf(first) || 22050;
  // Pass one: how long the whole file is. Pass two: write it. Each track is read on its own, so memory holds one at a time.
  let frames = 0;
  for (let i = 0; i < queue.paths.length; i++) {
    frames += (await readTrack(queue.paths[i], rate))?.length ?? 0;
    onProgress?.('join', i + 1, queue.paths.length * 2);
  }
  if (!frames) throw new Error('The saved speech could not be read.');

  await RNFS.mkdir(folder());
  for (const old of await RNFS.readDir(folder()).catch(() => [])) await RNFS.unlink(old.path).catch(() => undefined); // keep only the newest
  const path = `${folder()}/${slug(title)}.wav`;
  await RNFS.writeFile(path, toBase64(wavHeader(rate, frames)), 'base64');
  for (let i = 0; i < queue.paths.length; i++) {
    const track = await readTrack(queue.paths[i], rate);
    if (track?.length) await RNFS.appendFile(path, toBase64(samplesToBytes(track)), 'base64');
    onProgress?.('join', queue.paths.length + i + 1, queue.paths.length * 2);
  }
  const made = { path, seconds: frames / rate };
  useEpisodeAudio.getState().record({ key, ...made });
  return made;
}
