/**
 * What the AI can ask of the offline map files on the phone: which maps there are and where each covers, and the named places
 * (hospitals, cafes, campsites, peaks, streets...) near a point, read straight from the .map file with no internet. The reading is
 * done natively (AtlasDevice.mapInfo / mapPlaces); this file picks the right map file and words the answer. Nothing is guessed:
 * a place the map does not name is not reported.
 */
import { NativeModules } from 'react-native';
import { bearingDeg, compassName, distanceM, fmtDistance, installedMaps, useMaps } from './maps';

export interface MapEntry { path: string; name: string; sizeBytes?: number; source: 'downloaded' | 'from your files' }
export interface MapBounds { minLat: number; minLon: number; maxLat: number; maxLon: number; mapDate?: number }
export interface MapPlace { name: string; kind: string; lat: number; lon: number; distanceM: number }

const bounds = new Map<string, Promise<MapBounds | null>>();
const native = (): any => NativeModules.AtlasDevice;

export const nativeMapsAvailable = (): boolean => !!native()?.mapPlaces && !!native()?.mapInfo;

/** Every map file on the phone: the ones downloaded in Atlas and the ones picked from the phone's files. */
export async function mapsOnPhone(): Promise<MapEntry[]> {
  const out: MapEntry[] = [];
  try { for (const m of await installedMaps()) out.push({ path: m.path, name: m.name, sizeBytes: m.size, source: 'downloaded' }); } catch { /* none yet */ }
  for (const e of useMaps.getState().external) out.push({ path: e.uri, name: e.name, source: 'from your files' });
  return out;
}

/** Where a map covers; null when the file cannot be read. Remembered, so the file is opened once. */
export function boundsOf(path: string): Promise<MapBounds | null> {
  let known = bounds.get(path);
  if (!known) {
    known = Promise.resolve(native()?.mapInfo?.(path)).then((b: MapBounds | undefined) => b ?? null).catch(() => null);
    bounds.set(path, known);
  }
  return known;
}

export const covers = (b: MapBounds, lat: number, lon: number): boolean => lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;

const kmText = (m: number, imperial: boolean) => fmtDistance(m, imperial);
const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);

/** The maps on the phone, where each covers, which one is open, and whether the user's position is inside. */
export async function describeMaps(): Promise<string> {
  const maps = await mapsOnPhone();
  if (!maps.length) return 'There are no map files on this phone. The user can add one in Home > Maps > Maps on phone: download a region there, or open a .map file they already have.';
  const state = useMaps.getState();
  const here = state.lastFix;
  const lines: string[] = [];
  for (const m of maps) {
    const b = await boundsOf(m.path);
    const area = b ? `covers latitude ${b.minLat.toFixed(2)} to ${b.maxLat.toFixed(2)}, longitude ${b.minLon.toFixed(2)} to ${b.maxLon.toFixed(2)}` : 'coverage could not be read';
    const inside = b && here && covers(b, here.lat, here.lon) ? ' The user is inside this map.' : '';
    lines.push(`${m.name} (${m.source}${m.sizeBytes ? `, ${mb(m.sizeBytes)}` : ''}${state.current === m.path ? ', open on the Maps screen' : ''}): ${area}.${inside}`);
  }
  return lines.join('\n');
}

/** Words for a list of places: "Name (kind), 1.2 km NE". */
export function formatPlaces(places: MapPlace[], from: { lat: number; lon: number }, imperial: boolean): string {
  return places.map((p) => `${p.name} (${p.kind}), ${kmText(p.distanceM, imperial)} ${compassName(bearingDeg(from, p))}, at ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`).join('\n');
}

export interface PlaceSearch { query?: string; lat?: number; lon?: number; radiusKm?: number; limit?: number }

/** Named places near a point from the offline map that covers it. Defaults to the user's last GPS position. */
export async function placesNear(search: PlaceSearch = {}): Promise<string> {
  if (!nativeMapsAvailable()) return 'Reading map files needs the newest Atlas build on Android.';
  const state = useMaps.getState();
  const at = Number.isFinite(search.lat) && Number.isFinite(search.lon) ? { lat: search.lat as number, lon: search.lon as number } : state.lastFix;
  if (!at) return 'No position to search around. Ask the user to open Home > Maps once so GPS finds them, or give a latitude and longitude.';
  const maps = await mapsOnPhone();
  if (!maps.length) return 'There are no map files on this phone, so there is nothing to search. The user can add one in Home > Maps > Maps on phone.';
  let chosen: MapEntry | null = null;
  for (const m of [...maps].sort((a, b) => Number(state.current === b.path) - Number(state.current === a.path))) {
    const b = await boundsOf(m.path);
    if (b && covers(b, at.lat, at.lon)) { chosen = m; break; }
  }
  if (!chosen) return `None of the ${maps.length} map file${maps.length === 1 ? '' : 's'} on this phone covers ${at.lat.toFixed(4)}, ${at.lon.toFixed(4)}. Maps on the phone: ${maps.map((m) => m.name).join(', ')}.`;
  const radiusM = Math.max(0.2, Math.min(30, search.radiusKm ?? 5)) * 1000;
  const limit = Math.max(1, Math.min(25, Math.floor(search.limit ?? 10)));
  const query = (search.query ?? '').trim();
  let found: MapPlace[];
  try { found = await native().mapPlaces(chosen.path, at.lat, at.lon, radiusM, query, limit); }
  catch (e: any) { return `The map "${chosen.name}" could not be searched: ${String(e?.message || e)}`; }
  const scope = `${query ? `"${query}" ` : 'named places '}within ${Math.round(radiusM / 1000)} km, from the map "${chosen.name}"`;
  if (!found?.length) return `Nothing found for ${scope}. The map only lists what OpenStreetMap volunteers named, so a missing place is not proof it does not exist.`;
  return `${found.length} result${found.length === 1 ? '' : 's'} for ${scope}, nearest first:\n${formatPlaces(found, at, state.imperial)}`;
}

export const _resetMapBoundsForTests = (): void => { bounds.clear(); };
export { distanceM };
