/**
 * Podcast and briefing playback from pre-rendered audio. Each line is saved as a small WAV
 * in its host's voice ahead of time (a whole briefing right after it is written, and always
 * a few lines ahead of what is playing), then played from the file. Speaking each line live
 * meant the voice engine generated it only when its turn came: a wait before the first line
 * and a gap between lines. Falls back to live speech for a line that cannot be rendered.
 */
import RNFS from 'react-native-fs';
import { sha256 } from 'js-sha256';
import { audioSessionManager } from '../services/audioSessionManager';
import { canPreRender, speakAndWait, synthesizeLineToFile } from './tts';
import { hostVoices } from './neural';
import { useAtlasVoiceStore } from './store';
import logger from '../utils/logger';

export interface CastLine { text: string; pitch: number; voice?: string }

const AHEAD = 3;
/** Episodes whose audio is kept; older ones are deleted (they can be rendered again). */
const KEEP_EPISODES = 6;
const root = () => `${RNFS.CachesDirectoryPath}/podcast-audio`;
const dir = (key: string) => `${root()}/${key.replace(/[^\w-]/g, '_')}`;
const pathFor = (key: string, i: number, line: CastLine) =>
  `${dir(key)}/${i}-${sha256(`${line.voice ?? ''}|${useAtlasVoiceStore.getState().rate}|${line.text}`).slice(0, 12)}.wav`;

/** The voice and pitch for each host: chosen or automatic voices, or pitch alone with one voice. */
export function castLine(host: string, hosts: number, voices: { name: string }[]): { voice: string; pitch: number } {
  const i = host === 'A' ? 0 : host === 'B' ? 1 : 2;
  if (voices.length >= 2) { const names = hostVoices(voices); return { voice: names[i % names.length], pitch: 1 }; }
  return { voice: '', pitch: hosts === 1 ? 1 : [1.12, 0.86, 1.0][i] };
}

/** Files carry one voice each, not pitch: a cast told apart only by pitch is spoken live. */
const renderable = (items: CastLine[]) => canPreRender() && items.every((x) => x.pitch === 1 || !!x.voice);

let queue: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<string | null>>();

/** The file for line i, rendering it (in order, one at a time) if it is not saved yet. */
function render(key: string, items: CastLine[], i: number): Promise<string | null> {
  const path = pathFor(key, i, items[i]);
  const known = pending.get(path);
  if (known) return known;
  const job = queue.then(async () => {
    if (await RNFS.exists(path)) return path;
    await RNFS.mkdir(dir(key));
    try { return await synthesizeLineToFile(items[i].text, items[i].voice ?? '', path); } catch (e: any) {
      logger.warn(`[POD] could not render line ${i}: ${e?.message ?? e}`);
      return null;
    }
  });
  queue = job.catch(() => null);
  pending.set(path, job);
  job.then((p) => { if (!p) pending.delete(path); }).catch(() => pending.delete(path));
  return job;
}

/** Deletes the audio of all but the newest episodes, so the cache does not grow forever. */
export async function pruneEpisodes(keepKey: string): Promise<void> {
  try {
    const dirs = (await RNFS.readDir(root())).filter((d) => d.isDirectory() && d.path !== dir(keepKey));
    const newest = dirs.sort((a, b) => (b.mtime?.getTime() ?? 0) - (a.mtime?.getTime() ?? 0));
    for (const d of newest.slice(KEEP_EPISODES - 1)) {
      for (const p of [...pending.keys()]) if (p.startsWith(`${d.path}/`)) pending.delete(p);
      await RNFS.unlink(d.path);
    }
  } catch { /* nothing cached yet */ }
}

/** Renders a whole episode in the background (right after a briefing is written). */
export function preRenderEpisode(key: string, items: CastLine[]): void {
  if (!renderable(items)) return;
  pruneEpisodes(key).catch(() => undefined);
  items.forEach((_, i) => { render(key, items, i).catch(() => undefined); });
}

let ctx: any = null;
let source: any = null;
let stopToken = 0;

function playFile(path: string): Promise<boolean> {
  const token = stopToken;
  return new Promise((resolve) => {
    (async () => {
      await audioSessionManager.ensurePlayback();
      if (!ctx) { const { AudioContext } = require('react-native-audio-api'); ctx = new AudioContext(); }
      const buffer = await ctx.decodeAudioData(path);
      if (token !== stopToken) { resolve(false); return; }
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      node.onEnded = () => { if (source === node) source = null; resolve(token === stopToken); };
      source = node;
      node.start();
    })().catch((e) => { logger.warn(`[POD] playback failed: ${e?.message ?? e}`); resolve(false); });
  });
}

/**
 * Plays line i of an episode: from its saved file when possible (rendering the next lines
 * meanwhile), otherwise spoken live. Resolves false when stopped.
 */
export async function playLine(key: string, items: CastLine[], i: number): Promise<boolean> {
  const line = items[i];
  if (!renderable(items)) return speakAndWait(line.text, line.pitch, 'podcast', line.voice || '');
  const token = stopToken;
  // This line first, then the next few behind it, so it never waits for the others.
  const current = render(key, items, i);
  for (let k = i + 1; k <= Math.min(items.length - 1, i + AHEAD); k++) render(key, items, k).catch(() => undefined);
  const path = await current;
  if (token !== stopToken) return false;
  if (!path) return speakAndWait(line.text, line.pitch, 'podcast', line.voice || '');
  const ok = await playFile(path);
  return ok && token === stopToken;
}

/** Stops whatever podcast line is playing from a file. */
export function stopPodcastAudio(): void {
  stopToken++;
  try { source?.stop(); } catch { /* already stopped */ }
  source = null;
}
