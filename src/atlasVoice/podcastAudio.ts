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
const CACHE_MAX_BYTES = 256 * 1024 * 1024;
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const cacheRoot = () => `${RNFS.CachesDirectoryPath}/podcast-audio`;
const dir = (key: string) => `${cacheRoot()}/${key.replace(/[^\w-]/g, '_')}`;
let activePlaybackPath: string | null = null;
let lastCacheCleanup = 0;
const voiceProfile = () => {
  const s = useAtlasVoiceStore.getState();
  return `${s.neuralVoice}|${s.neuralSid}|${s.rate}`;
};
const pathFor = (key: string, i: number, line: CastLine) =>
  `${dir(key)}/${i}-${sha256([voiceProfile(), line.voice ?? '', line.text].join('|')).slice(0, 12)}.wav`;

/** The voice and pitch for each host: chosen or automatic voices, or pitch alone with one voice. */
export function castLine(host: string, hosts: number, voices: { name: string }[]): { voice: string; pitch: number } {
  const i = host === 'A' ? 0 : host === 'B' ? 1 : 2;
  if (voices.length >= 2) { const names = hostVoices(voices); return { voice: names[i % names.length], pitch: 1 }; }
  return { voice: '', pitch: hosts === 1 ? 1 : [1.12, 0.86, 1.0][i] };
}

/** Files carry one voice each, not pitch: a cast told apart only by pitch is spoken live. */
const renderable = (items: CastLine[]) => canPreRender() && items.every((x) => x.pitch === 1 || !!x.voice);

/** A foreground playback request must not wait behind an entire unrelated episode. */
interface RenderJob { path: string; execute: () => Promise<string | null>; finish: (value: string | null) => void }
const backgroundJobs: RenderJob[] = [];
const playbackJobs: RenderJob[] = [];
const pending = new Map<string, Promise<string | null>>();
let workerRunning = false;

function drainRenders(): void {
  if (workerRunning) return;
  workerRunning = true;
  (async () => {
    while (playbackJobs.length || backgroundJobs.length) {
      const job = playbackJobs.shift() ?? backgroundJobs.shift()!;
      try { job.finish(await job.execute()); }
      catch (e: any) {
        logger.warn(`[POD] render failed: ${e?.message ?? e}`);
        job.finish(null);
      } finally { pending.delete(job.path); }
    }
  })().finally(() => {
    workerRunning = false;
    if (playbackJobs.length || backgroundJobs.length) drainRenders();
  }).catch((e: any) => logger.error(`[POD] scheduler error: ${e?.message ?? e}`));
}

/**
 * Remove only disposable WAV directories owned by Atlas. Never touch in-flight or playing
 * audio. Age and total-byte limits bound cache growth without blocking the first spoken line.
 */
export async function prunePodcastCache(now = Date.now()): Promise<number> {
  const root = cacheRoot();
  const entries = await RNFS.readDir(root).catch(() => []);
  const directories: { path: string; bytes: number; modified: number }[] = [];
  const modifiedAt = (d?: Date | null): number => {
    const n = d ? new Date(d).getTime() : NaN;
    return Number.isFinite(n) ? n : now;
  };
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[\w-]{1,160}$/.test(entry.name)) continue;
    const path = `${root}/${entry.name}`;
    const files = await RNFS.readDir(path).catch(() => []);
    // Unexpected files mean this directory may not be a disposable generated-audio folder.
    if (!files.length || files.some(f => !f.isFile() || !/^\d+-[a-f0-9]{12}\.wav$/.test(f.name))) continue;
    const bytes = files.reduce((sum, file) => sum + Math.max(0, Number(file.size) || 0), 0);
    const modified = Math.max(modifiedAt(entry.mtime), ...files.map(f => modifiedAt(f.mtime)));
    directories.push({ path, bytes, modified });
  }
  let total = directories.reduce((sum, folder) => sum + folder.bytes, 0);
  let removed = 0;
  for (const folder of directories.sort((a, b) => a.modified - b.modified)) {
    if (total <= CACHE_MAX_BYTES && now - folder.modified <= CACHE_MAX_AGE_MS) continue;
    if (activePlaybackPath?.startsWith(`${folder.path}/`) ||
      [...pending.keys()].some((path) => path.startsWith(`${folder.path}/`))) continue;
    try { await RNFS.unlink(folder.path); total -= folder.bytes; removed++; }
    catch (e: any) { logger.warn(`[POD] cache cleanup failed: ${e?.message ?? e}`); }
  }
  return removed;
}

function scheduleCacheCleanup(): void {
  const now = Date.now();
  if (now - lastCacheCleanup < 24 * 60 * 60 * 1000) return;
  lastCacheCleanup = now;
  prunePodcastCache(now).catch((e: any) => logger.warn(`[POD] cache scan failed: ${e?.message ?? e}`));
}

/** Reuse in-flight work, promoting it ahead of background jobs for immediate playback. */
function render(key: string, items: CastLine[], request: { index: number; urgent?: boolean }): Promise<string | null> {
  const { index: i, urgent = false } = request;
  const path = pathFor(key, i, items[i]);
  const known = pending.get(path);
  if (known) {
    if (urgent) {
      const queued = backgroundJobs.findIndex((job) => job.path === path);
      if (queued >= 0) playbackJobs.push(backgroundJobs.splice(queued, 1)[0]);
    }
    return known;
  }
  let finish!: (value: string | null) => void;
  const promise = new Promise<string | null>((resolve) => { finish = resolve; });
  pending.set(path, promise);
  const job: RenderJob = { path, finish, execute: async () => {
    if (await RNFS.exists(path)) return path;
    await RNFS.mkdir(dir(key));
    return synthesizeLineToFile(items[i].text, items[i].voice ?? '', path);
  } };
  (urgent ? playbackJobs : backgroundJobs).push(job);
  drainRenders();
  return promise;
}

/** Renders a whole episode in the background (right after a briefing is written). */
export function preRenderEpisode(key: string, items: CastLine[]): void {
  if (!renderable(items)) return;
  scheduleCacheCleanup();
  items.forEach((_, i) => { render(key, items, { index: i }).catch(() => undefined); });
}

let ctx: any = null;
let source: any = null;
let stopToken = 0;

function playFile(path: string, onUnreadable?: () => void): Promise<boolean> {
  const token = stopToken;
  activePlaybackPath = path;
  return new Promise((resolve) => {
    (async () => {
      await audioSessionManager.ensurePlayback();
      if (!ctx) { const { AudioContext } = require('react-native-audio-api'); ctx = new AudioContext(); }
      const buffer = await ctx.decodeAudioData(path).catch((e: unknown) => {
        if (token === stopToken) onUnreadable?.();
        throw e;
      });
      if (token !== stopToken) {
        if (activePlaybackPath === path) activePlaybackPath = null;
        resolve(false); return;
      }
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      node.onEnded = () => {
        if (source === node) source = null;
        if (activePlaybackPath === path) activePlaybackPath = null;
        resolve(token === stopToken);
      };
      source = node;
      node.start();
    })().catch((e) => {
      if (activePlaybackPath === path) activePlaybackPath = null;
      logger.warn(`[POD] playback failed: ${e?.message ?? e}`);
      resolve(false);
    });
  });
}

/**
 * Plays line i of an episode: from its saved file when possible (rendering the next lines
 * meanwhile), otherwise spoken live. Resolves false when stopped.
 */
export async function playLine(key: string, items: CastLine[], i: number): Promise<boolean> {
  const line = items[i];
  if (!renderable(items)) return speakAndWait(line.text, line.pitch, 'podcast', line.voice || '');
  scheduleCacheCleanup();
  const token = stopToken;
  // This line first, then the next few behind it, so it never waits for the others.
  const current = render(key, items, { index: i, urgent: true });
  for (let k = i + 1; k <= Math.min(items.length - 1, i + AHEAD); k++) {
    render(key, items, { index: k, urgent: true }).catch(() => undefined);
  }
  const path = await current;
  if (token !== stopToken) return false;
  if (!path) return speakAndWait(line.text, line.pitch, 'podcast', line.voice || '');
  let unreadable = false;
  const ok = await playFile(path, () => { unreadable = true; });
  if (ok || !unreadable || token !== stopToken) return ok && token === stopToken;
  // This is an Atlas-generated cache file; discard a broken copy and repair it once.
  try { await RNFS.unlink(path); } catch { return false; }
  if (token !== stopToken) return false;
  const repaired = await render(key, items, { index: i, urgent: true });
  if (token !== stopToken) return false;
  if (!repaired) return speakAndWait(line.text, line.pitch, 'podcast', line.voice || '');
  return (await playFile(repaired)) && token === stopToken;
}

/** Stops whatever podcast line is playing from a file. */
export function stopPodcastAudio(): void {
  stopToken++;
  try { source?.stop(); } catch { /* already stopped */ }
  source = null;
  activePlaybackPath = null;
}
