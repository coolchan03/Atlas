/**
 * Space that is safe to give back: caches Atlas rebuilds by itself. Nothing here is a model, a document, a saved question, a chat
 * or a backup. Sizes come from the files on disk, are computed one folder at a time, and a folder that a running job may still be
 * using is left out of the default selection.
 */
import RNFS from 'react-native-fs';
import { useTasks, isActive } from '../tasks/taskRegistry';

export interface CacheItem {
  id: string; label: string; path: string; bytes: number;
  /** What happens after it is cleared. */
  rebuild: string;
  /** Ticked by default only when it is proven disposable and no running job can be using it. */
  safeByDefault: boolean;
  /** Why it is not ticked, when it is not. */
  note?: string;
}

interface Kind { match: RegExp; label: string; rebuild: string; inUseWhileBusy: boolean }
/** The cache folders Atlas writes, by name. Anything not listed here is never offered. */
export const CACHE_KINDS: Kind[] = [
  { match: /^podcast-audio$/, label: 'Briefing and podcast audio', rebuild: 'Made again the next time you play it.', inUseWhileBusy: true },
  { match: /^updates$/, label: 'Downloaded app updates', rebuild: 'Downloaded again if you update.', inUseWhileBusy: true },
  { match: /^llm-sessions$/, label: 'Saved chat prompt state', rebuild: 'Chats reopen a little slower the first time.', inUseWhileBusy: true },
  { match: /^(office_|epub-|skill-import-|atlas-video-|atlas-presentation-)/, label: 'Leftover import and export files', rebuild: 'Not needed again. They are scratch files from finished jobs.', inUseWhileBusy: true },
];

export const classifyCacheName = (name: string): Kind | undefined => CACHE_KINDS.find((k) => k.match.test(name));

/** Pure: which entries to offer and which to tick, given whether any long-running job is active. */
export function planCleanup(entries: Array<{ name: string; path: string; bytes: number }>, busy: boolean): CacheItem[] {
  const out: CacheItem[] = [];
  for (const e of entries) {
    const kind = classifyCacheName(e.name);
    if (!kind || e.bytes <= 0) continue;
    const hold = busy && kind.inUseWhileBusy;
    out.push({ id: e.name, label: kind.label, path: e.path, bytes: e.bytes, rebuild: kind.rebuild, safeByDefault: !hold, ...(hold ? { note: 'A job is running and may be using this, so it is not selected.' } : {}) });
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

async function sizeOf(path: string): Promise<number> {
  let total = 0;
  const items = await RNFS.readDir(path).catch(() => []);
  for (const f of items) total += f.isDirectory() ? await sizeOf(f.path) : Number(f.size) || 0;
  return total;
}

/** Looks at the cache folder and returns what could be cleared, with real sizes. Reads only; deletes nothing. */
export async function scanCaches(): Promise<CacheItem[]> {
  const root = RNFS.CachesDirectoryPath;
  const top = await RNFS.readDir(root).catch(() => []);
  const entries: Array<{ name: string; path: string; bytes: number }> = [];
  for (const f of top) {
    if (!classifyCacheName(f.name)) continue;
    entries.push({ name: f.name, path: f.path, bytes: f.isDirectory() ? await sizeOf(f.path) : Number(f.size) || 0 });
  }
  return planCleanup(entries, useTasks.getState().tasks.some(isActive));
}

/** Deletes the chosen items (only ones the scan offered, only inside the cache folder). Returns the bytes freed. */
export async function clearCaches(items: CacheItem[]): Promise<number> {
  const root = `${RNFS.CachesDirectoryPath}/`;
  let freed = 0;
  for (const item of items) {
    if (!item.path.startsWith(root) || item.path.includes('..') || !classifyCacheName(item.path.slice(root.length).split('/')[0])) continue;
    try { await RNFS.unlink(item.path); freed += item.bytes; } catch { /* left in place; the next scan shows it again */ }
  }
  return freed;
}
