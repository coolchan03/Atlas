/**
 * The rest of Atlas for offline sync: settings, the language course, study, the daily
 * briefing, maps, survival notes, checklists, the offline library list, voices and
 * recordings. Each store goes across whole; the copy changed most recently wins. Recordings
 * merge by id instead, so a recording made on each phone keeps both. Secrets (API keys,
 * lock settings, the vault) never go across, and settings tied to one phone's hardware
 * (threads, GPU, backends) stay as they are on each phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { sha256 } from 'js-sha256';
import { EXCLUDED_BACKUP_KEYS, RESTORABLE_STORE_KEYS, sanitizeBackupValue } from '../../atlasTools/backup';
import { rehydrateStores } from '../../atlasTools/storeRegistry';
import { DEVICE_SETTING, keepThisDevice } from '../../atlasTools/deviceSettings';

const STAMPS = 'atlas-sync-store-stamps-v1';
export const APP_STORE = 'local-llm-app-storage';
export const RECORDINGS = 'atlas-recordings';
export const LANGUAGE = 'atlas-language';
/** Stores merged item by item every time, so work done on both phones is all kept. */
const ALWAYS_MERGE = new Set([RECORDINGS, LANGUAGE]);
/** Chats, projects and agents have their own record-by-record merge (merge.ts). */
const OWN_MERGE = new Set(['local-llm-chat-storage', 'local-llm-project-storage', 'atlas-agent-storage']);

export interface StoreEntry { value: string; changedAt: number }
export type StoreSnapshot = Record<string, StoreEntry>;
type Stamps = Record<string, { hash: string; changedAt: number }>;

export const syncedStoreKeys = (): string[] =>
  [...RESTORABLE_STORE_KEYS, RECORDINGS, 'atlas-voice-profiles']
    .filter((k) => !OWN_MERGE.has(k) && !EXCLUDED_BACKUP_KEYS.test(k));

/** The part of a store that is shared: for app settings only the person's choices. */
export function shareable(key: string, raw: string): string | null {
  const safe = sanitizeBackupValue(raw);
  if (!safe || key !== APP_STORE) return safe;
  const parsed = JSON.parse(safe);
  const settings = Object.fromEntries(Object.entries(parsed?.state?.settings ?? {}).filter(([k]) => !DEVICE_SETTING.test(k)));
  return JSON.stringify({ state: { settings, themeMode: parsed?.state?.themeMode }, version: parsed?.version });
}

const recordingsDir = () => `${RNFS.DocumentDirectoryPath}/atlas-recordings`;

/** Applies a remote store to the local raw value. Returns the new raw value, or null to leave it. */
export function combine(key: string, { local, remote, deletedRecordings = {}, remoteNewer = true }: { local: string | null; remote: string; deletedRecordings?: Record<string, number>; remoteNewer?: boolean }): string | null {
  if (key === APP_STORE) {
    // The incoming copy is only the shared part (settings and theme): keep the rest of this
    // device's app store, then this device's hardware settings over it.
    const mine = local ? JSON.parse(local) : { state: {} };
    const theirs = JSON.parse(remote);
    const merged = { ...mine, state: { ...mine.state, themeMode: theirs.state?.themeMode ?? mine.state?.themeMode,
      settings: { ...mine.state?.settings, ...theirs.state?.settings } } };
    return keepThisDevice(local, JSON.stringify(merged));
  }
  if (key === RECORDINGS) {
    const mine = local ? JSON.parse(local) : { state: { recordings: [], consent: false }, version: 0 };
    const theirs = JSON.parse(remote);
    const kept = (mine.state?.recordings ?? []).filter((r: { id: string }) => !deletedRecordings[r.id]);
    const have = new Set(kept.map((r: { id: string }) => r.id));
    const fresh = (theirs.state?.recordings ?? [])
      .filter((r: { id: string; status: string }) => /^[\w-]{1,80}$/.test(r.id) && !have.has(r.id) && !deletedRecordings[r.id] && r.status !== 'processing')
      // The audio lives in this phone's own folder; it arrives separately (see audio.ts).
      .map((r: { id: string }) => ({ ...r, audioPath: `${recordingsDir()}/${r.id}.wav` }));
    if (!fresh.length && kept.length === (mine.state?.recordings ?? []).length) return null;
    mine.state = { ...mine.state, recordings: [...kept, ...fresh] };
    return JSON.stringify(mine);
  }
  if (key === LANGUAGE) return local ? mergeLanguage(local, remote, remoteNewer) : remote;
  return remote;
}

type Obj = Record<string, any>;
const byLanguage = (a: Obj = {}, b: Obj = {}, inner: (x: any, y: any) => any) =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, inner(a[k], b[k])]));
const union = (x: Obj = {}, y: Obj = {}) => ({ ...x, ...y });
const unionBy = <T,>(x: T[] = [], y: T[] = [], id: (t: T) => string) => {
  const seen = new Set(x.map(id));
  return [...x, ...y.filter((t) => !seen.has(id(t)))];
};

/**
 * The language course from both phones: every written lesson, story, saved word and looked-up
 * word; for each square the best stars and most lessons; for each day the most XP; the newer
 * review schedule per word. Settings (language, level, goal) follow the copy changed most
 * recently, so both phones end up with the same ones instead of swapping them.
 */
export function mergeLanguage(localRaw: string, remoteRaw: string, remoteNewer = true): string {
  const a = JSON.parse(localRaw);
  const b = JSON.parse(remoteRaw);
  const x: Obj = a.state ?? {};
  const y: Obj = b.state ?? {};
  const best = (p: Obj = {}, q: Obj = {}) => byLanguage(p, q, (m: any, n: any) => (!m ? n : !n ? m
    : { stars: Math.max(m.stars, n.stars), lessons: Math.max(m.lessons, n.lessons) }));
  const memory = (p: Obj = {}, q: Obj = {}) => byLanguage(p, q, (m: any, n: any) => (!m ? n : !n ? m
    : (n.due >= m.due ? n : m)));
  const state = {
    ...(remoteNewer ? { ...x, ...y } : { ...y, ...x }),
    content: byLanguage(x.content, y.content, union),
    tips: byLanguage(x.tips, y.tips, union),
    glossary: byLanguage(x.glossary, y.glossary, union),
    progress: byLanguage(x.progress, y.progress, best),
    memory: byLanguage(x.memory, y.memory, memory),
    listening: byLanguage(x.listening, y.listening, (m: any[], n: any[]) => unionBy(m, n, (l: any) => `${l.pieceId ?? ''}:${l.createdAt}`)),
    myWords: byLanguage(x.myWords, y.myWords, (m: any[], n: any[]) => unionBy(m, n, (w: any) => w.t)),
    history: byLanguage(x.history, y.history, (m: any, n: any) => (!m ? n : !n ? m
      : { xp: Math.max(m.xp, n.xp), lessons: Math.max(m.lessons, n.lessons) })),
    xp: Math.max(x.xp ?? 0, y.xp ?? 0),
    streak: (y.streak?.count ?? 0) >= (x.streak?.count ?? 0) ? y.streak : x.streak,
    saved: { ...x.saved, ...y.saved },
  };
  return JSON.stringify({ ...(remoteNewer ? { ...a, ...b } : { ...b, ...a }), state, version: Math.max(a.version ?? 0, b.version ?? 0) });
}

async function readStamps(): Promise<Stamps> {
  try { return JSON.parse((await AsyncStorage.getItem(STAMPS)) ?? '{}'); } catch { return {}; }
}

/** This phone's shareable stores, each with when it last changed (noticed by its content changing). */
export async function localStores(now = Date.now()): Promise<StoreSnapshot> {
  const stamps = await readStamps();
  const out: StoreSnapshot = {};
  const keys = syncedStoreKeys();
  for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
    if (raw == null) continue;
    const value = shareable(key, raw);
    if (value == null) continue;
    const hash = sha256(value);
    if (stamps[key]?.hash !== hash) stamps[key] = { hash, changedAt: now };
    out[key] = { value, changedAt: stamps[key].changedAt };
  }
  await AsyncStorage.setItem(STAMPS, JSON.stringify(stamps));
  return out;
}

/**
 * Takes the other phone's stores where they changed more recently than this phone's, and
 * recordings this phone does not have yet. Loads them into the running app.
 */
export async function applyStores(remote: unknown, deletedRecordings: Record<string, number> = {}): Promise<string[]> {
  if (!remote || typeof remote !== 'object') return [];
  const mine = await localStores();
  const stamps = await readStamps();
  const allowed = new Set(syncedStoreKeys());
  const changed: string[] = [];
  for (const [key, entry] of Object.entries(remote as Record<string, StoreEntry>)) {
    if (!allowed.has(key) || typeof entry?.value !== 'string' || typeof entry.changedAt !== 'number') continue;
    const value = shareable(key, entry.value);
    if (value == null || mine[key]?.value === value) continue;
    // Recordings and the course always merge; other stores take the newer copy.
    if (!ALWAYS_MERGE.has(key) && (mine[key]?.changedAt ?? 0) >= entry.changedAt) continue;
    const remoteNewer = entry.changedAt > (mine[key]?.changedAt ?? 0);
    const next = combine(key, { local: await AsyncStorage.getItem(key), remote: value, deletedRecordings, remoteNewer });
    if (next == null) continue;
    await AsyncStorage.setItem(key, next);
    const shared = shareable(key, next);
    if (shared) stamps[key] = { hash: sha256(shared), changedAt: Math.max(entry.changedAt, mine[key]?.changedAt ?? 0) };
    changed.push(key);
  }
  await AsyncStorage.setItem(STAMPS, JSON.stringify(stamps));
  await rehydrateStores(changed);
  return changed;
}
