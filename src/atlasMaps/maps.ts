import RNFS from 'react-native-fs';
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Offline maps: Mapsforge vector map files (one file per country / US state), downloaded
 * once while online, then drawn on the phone with no internet. GPS works without internet.
 */
export const MAP_SERVERS = [
  'https://download.mapsforge.org/maps/v5/',
  'https://ftp-stud.hs-esslingen.de/pub/Mirrors/download.mapsforge.org/maps/v5/',
];
export const mapsDir = () => `${RNFS.ExternalDirectoryPath}/maps`;

export interface Waypoint { id: string; name: string; lat: number; lon: number; createdAt: number }
export interface GpsFix { lat: number; lon: number; accuracy: number; altitude: number; speed: number; time: number }

interface MapsState {
  current: string | null; // path of the map file in use
  external: { uri: string; name: string }[]; // .map files picked from the phone's storage
  imperial: boolean;
  waypoints: Waypoint[];
  lastFix: GpsFix | null;
  setCurrent: (p: string | null) => void;
  addExternal: (uri: string, name: string) => void;
  removeExternal: (uri: string) => void;
  setImperial: (v: boolean) => void;
  addWaypoint: (w: Omit<Waypoint, 'id' | 'createdAt'>) => void;
  renameWaypoint: (id: string, name: string) => void;
  removeWaypoint: (id: string) => void;
  setFix: (f: GpsFix) => void;
}
export const useMaps = create<MapsState>()(
  persist(
    (set) => ({
      current: null, external: [], imperial: true, waypoints: [], lastFix: null,
      setCurrent: (current) => set({ current }),
      addExternal: (uri, name) => set((s) => ({ external: [...s.external.filter((x) => x.uri !== uri), { uri, name }] })),
      removeExternal: (uri) => set((s) => ({ external: s.external.filter((x) => x.uri !== uri), current: s.current === uri ? null : s.current })),
      setImperial: (imperial) => set({ imperial }),
      addWaypoint: (w) => set((s) => ({ waypoints: [{ ...w, id: `${Date.now()}`, createdAt: Date.now() }, ...s.waypoints] })),
      renameWaypoint: (id, name) => set((s) => ({ waypoints: s.waypoints.map((w) => (w.id === id ? { ...w, name } : w)) })),
      removeWaypoint: (id) => set((s) => ({ waypoints: s.waypoints.filter((w) => w.id !== id) })),
      setFix: (lastFix) => set({ lastFix }),
    }),
    { name: 'atlas-maps', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

// ---------------------------------------------------------------- downloads
export interface RemoteEntry { name: string; path: string; isDir: boolean; size: string }
const listCache: Record<string, RemoteEntry[]> = {};

/** Lists one folder of the map server (continents, then countries, then states). */
export async function browseMaps(path = ''): Promise<RemoteEntry[]> {
  if (listCache[path]) return listCache[path];
  let lastErr: unknown = null;
  for (const base of MAP_SERVERS) {
    try {
      const r = await fetch(base + path);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const out: RemoteEntry[] = [];
      const re = /<a href="([^"?/][^"]*)">[^<]*<\/a>([^\n<]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        const href = decodeURIComponent(m[1]);
        if (href.startsWith('http') || href.startsWith('..')) continue;
        const isDir = href.endsWith('/');
        if (!isDir && !href.endsWith('.map')) continue;
        const size = (m[2].trim().split(/\s+/).pop() || '').replace(/^-$/, '');
        out.push({ name: href.replace(/\/$/, '').replace(/\.map$/, '').replace(/[-_]/g, ' '), path: path + href, isDir, size: isDir ? '' : size });
      }
      if (!out.length) throw new Error('Empty listing');
      listCache[path] = out;
      return out;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`Could not reach the map server (${String((lastErr as any)?.message || lastErr)}). You need internet to download maps.`);
}

interface DlState { progress: Record<string, number>; jobs: Record<string, number>; set: (fn: (s: DlState) => Partial<DlState>) => void }
export const useMapDownloads = create<DlState>((set) => ({ progress: {}, jobs: {}, set: (fn) => set(fn) }));

const fileNameFor = (remotePath: string) => remotePath.replace(/\//g, '_');

export async function downloadMap(remotePath: string): Promise<string> {
  await RNFS.mkdir(mapsDir());
  const target = `${mapsDir()}/${fileNameFor(remotePath)}`;
  const part = `${target}.part`;
  let lastErr: unknown = null;
  for (const base of MAP_SERVERS) {
    const { jobId, promise } = RNFS.downloadFile({
      fromUrl: base + remotePath, toFile: part, background: true, discretionary: false, progressInterval: 1000,
      progress: (p: any) => {
        const frac = p.contentLength > 0 ? p.bytesWritten / p.contentLength : 0;
        useMapDownloads.getState().set((s) => ({ progress: { ...s.progress, [remotePath]: frac } }));
      },
    } as any);
    useMapDownloads.getState().set((s) => ({ jobs: { ...s.jobs, [remotePath]: jobId }, progress: { ...s.progress, [remotePath]: 0 } }));
    try {
      const res = await promise;
      if (res.statusCode && res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}`);
      if (await RNFS.exists(target)) await RNFS.unlink(target);
      await RNFS.moveFile(part, target);
      if (!useMaps.getState().current) useMaps.getState().setCurrent(target);
      return target;
    } catch (e) {
      lastErr = e;
      await RNFS.unlink(part).catch(() => undefined);
      if (useMapDownloads.getState().jobs[remotePath] === undefined) break; // cancelled
    } finally {
      useMapDownloads.getState().set((s) => {
        const jobs = { ...s.jobs }; delete jobs[remotePath];
        const progress = { ...s.progress }; delete progress[remotePath];
        return { jobs, progress };
      });
    }
  }
  throw new Error(`Download failed: ${String((lastErr as any)?.message || lastErr)}`);
}

export function cancelMapDownload(remotePath: string): void {
  const id = useMapDownloads.getState().jobs[remotePath];
  useMapDownloads.getState().set((s) => { const jobs = { ...s.jobs }; delete jobs[remotePath]; return { jobs }; });
  if (id !== undefined) RNFS.stopDownload(id);
}

export interface LocalMap { path: string; name: string; size: number }
export async function installedMaps(): Promise<LocalMap[]> {
  if (!(await RNFS.exists(mapsDir()))) return [];
  const files = await RNFS.readDir(mapsDir());
  return files.filter((f: any) => f.isFile() && f.name.endsWith('.map'))
    .map((f: any) => ({ path: f.path, name: f.name.replace(/\.map$/, '').split('_').pop()!.replace(/[-_]/g, ' '), size: Number(f.size) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteMap(path: string): Promise<void> {
  await RNFS.unlink(path).catch(() => undefined);
  if (useMaps.getState().current === path) {
    const rest = await installedMaps();
    useMaps.getState().setCurrent(rest[0]?.path ?? null);
  }
}

// ---------------------------------------------------------------- GPS
const Native: any = NativeModules.AtlasDevice;

export async function askLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}

/** Starts GPS; calls onFix with each new position. Returns a stop function. */
export async function watchPosition(onFix: (f: GpsFix) => void, onError: (msg: string) => void): Promise<() => void> {
  if (!Native?.startLocation) { onError('GPS is not available in this build.'); return () => undefined; }
  if (!(await askLocationPermission())) { onError('Location permission was not given. Allow it in Android Settings > Apps > Off Grid Atlas > Permissions.'); return () => undefined; }
  const em = new NativeEventEmitter(Native);
  const sub = em.addListener('AtlasLocation', (f: GpsFix) => { useMaps.getState().setFix(f); onFix(f); });
  try {
    const last = await Native.lastLocation();
    if (last) { useMaps.getState().setFix(last); onFix(last); }
    await Native.startLocation();
  } catch (e: any) {
    onError(e?.code === 'NO_GPS' ? 'Location is turned off. Turn on Location in your quick settings (no internet needed).' : String(e?.message || e));
  }
  return () => { sub.remove(); Native.stopLocation().catch(() => undefined); };
}

// ---------------------------------------------------------------- geometry
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = (deg: number) => DIRS[Math.round(deg / 45) % 8];
export function fmtDistance(m: number, imperial: boolean): string {
  if (imperial) { const ft = m * 3.28084; return ft < 1000 ? `${Math.round(ft)} ft` : `${(m / 1609.34).toFixed(m < 16093 ? 1 : 0)} mi`; }
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
export function fmtCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`;
}
