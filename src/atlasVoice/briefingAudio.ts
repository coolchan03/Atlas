/**
 * The briefing (or any podcast) as ONE audio file: every line in its host's voice, with the opening and closing tunes and the quiet
 * between stories, joined in the order they are played. Made from the lines the show already saved, so a show that has been listened
 * to is joined in seconds; lines not saved yet are made first. The file is written in pieces, so a half hour of speech never has to
 * sit in memory at once.
 */
import RNFS from 'react-native-fs';
import { nativeEpisodeQueue, renderEpisode, type CastLine, type NativeEpisodeQueueOpts } from './podcastAudio';
import { fromBase64, readPcm16 } from './wavTrim';
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

const UNREADABLE = 'One of the saved lines is in a format that cannot be joined. Make the briefing again, then try once more.';
const folder = () => `${RNFS.CachesDirectoryPath}/briefing-audio`;
const slug = (title: string) => title.replace(/[^A-Za-z0-9 _-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/ /g, '-') || 'briefing';


/** A saved file as samples at `rate`. A file that cannot be read stops the export (a spoken line left out would make a show with holes in it); a tune can be left out. */
async function readTrack(path: string, rate: number): Promise<Int16Array> {
  const samples = monoSamplesAt(fromBase64(await RNFS.readFile(path, 'base64')), rate);
  if (samples) return samples;
  if (path.includes('/_jingles/')) return new Int16Array(0);
  throw new Error(UNREADABLE);
}

const inFlight = new Map<string, Promise<EpisodeAudio>>();

/** The whole show as one WAV. Two asks for the same show at once (a scheduled run and the button) share one job, so they never write the same file. */
export function exportEpisodeAudio(key: string, items: CastLine[], opts: EpisodeAudioOpts): Promise<EpisodeAudio> {
  const running = inFlight.get(key);
  if (running) return running;
  const job = joinEpisode(key, items, opts).finally(() => { inFlight.delete(key); });
  inFlight.set(key, job);
  return job;
}

async function joinEpisode(key: string, items: CastLine[], opts: EpisodeAudioOpts): Promise<EpisodeAudio> {
  const { title, tunes, jingleVolume, onProgress } = opts;
  if (!items.length) throw new Error('There is nothing to save yet.');
  const ready = await renderEpisode(key, items, (done, total) => onProgress?.('voice', done, total));
  if (!ready) throw new Error('Some lines could not be turned into speech on this phone, so the audio file cannot be made.');
  const queue = await nativeEpisodeQueue(key, items, { from: 0, tunes, jingleVolume });
  if (!queue) throw new Error('The saved speech for this show is not all there. Play it once, then try again.');

  const first = readPcm16(fromBase64(await RNFS.readFile(queue.paths.find((p) => !p.includes('/_jingles/')) ?? queue.paths[0], 'base64')));
  // Every other track is brought to this rate, so a damaged first file must stop here, not make a sample rate of billions.
  if (!first || first.rate < 8000 || first.rate > 96000) throw new Error(UNREADABLE);
  const rate = first.rate;
  // Pass one: how long the whole file is. Pass two: write it. Each track is read on its own, so memory holds one at a time.
  let frames = 0;
  for (let i = 0; i < queue.paths.length; i++) {
    frames += (await readTrack(queue.paths[i], rate)).length;
    onProgress?.('join', i + 1, queue.paths.length * 2);
  }
  if (!frames) throw new Error('The saved speech could not be read.');

  await RNFS.mkdir(folder());
  for (const old of await RNFS.readDir(folder()).catch(() => [])) await RNFS.unlink(old.path).catch(() => undefined); // keep only the newest
  const path = `${folder()}/${slug(title)}.wav`;
  await RNFS.writeFile(path, toBase64(wavHeader(rate, frames)), 'base64');
  for (let i = 0; i < queue.paths.length; i++) {
    const track = await readTrack(queue.paths[i], rate);
    if (track.length) await RNFS.appendFile(path, toBase64(samplesToBytes(track)), 'base64');
    onProgress?.('join', queue.paths.length + i + 1, queue.paths.length * 2);
  }
  const made = { path, seconds: frames / rate };
  useEpisodeAudio.getState().record({ key, ...made });
  return made;
}
