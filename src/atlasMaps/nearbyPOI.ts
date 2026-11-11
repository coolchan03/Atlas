/**
 * Nearby points of interest via the Overpass API (OpenStreetMap data).
 * Used to give the AI context about airports, campsites, hospitals and fuel stations near the user.
 * Results are cached for 10 minutes so they don't block chat generation.
 */
import { bearingDeg, compassName, distanceM, useMaps } from './maps';
import { useAppStore } from '../stores/appStore';

export interface POI { name: string; kind: string; distanceM: number; direction: string }

function kindOf(tags: Record<string, string>): string {
  if (tags.aeroway === 'aerodrome') return 'airport';
  if (tags.tourism === 'camp_site') return 'campsite';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'fuel') return 'fuel station';
  return 'place';
}

function buildQuery(lat: number, lon: number, radiusM: number): string {
  return `[out:json][timeout:8];
(
  node["aeroway"="aerodrome"](around:${radiusM},${lat},${lon});
  way["aeroway"="aerodrome"](around:${radiusM},${lat},${lon});
  node["tourism"="camp_site"](around:${radiusM},${lat},${lon});
  node["amenity"="hospital"](around:5000,${lat},${lon});
  node["amenity"="fuel"](around:3000,${lat},${lon});
);
out center 20;`;
}

/** Queries the Overpass API for POIs near a coordinate. Returns [] on any error or timeout. */
export async function fetchNearbyPOI(lat: number, lon: number, radiusM = 15000): Promise<POI[]> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8500);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildQuery(lat, lon, radiusM))}`,
      signal: c.signal,
    });
    if (!res.ok) return [];
    const json = await res.json() as { elements?: Array<{ type: string; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }> };
    const here = { lat, lon };
    const pois: POI[] = [];
    for (const el of json.elements ?? []) {
      const tags = el.tags ?? {};
      const name = tags.name ?? tags['name:en'];
      if (!name) continue;
      const elLat = el.type === 'way' ? el.center?.lat : el.lat;
      const elLon = el.type === 'way' ? el.center?.lon : el.lon;
      if (elLat == null || elLon == null) continue;
      const point = { lat: elLat, lon: elLon };
      pois.push({ name, kind: kindOf(tags), distanceM: distanceM(here, point), direction: compassName(bearingDeg(here, point)) });
    }
    pois.sort((a, b) => a.distanceM - b.distanceM);
    return pois.slice(0, 8);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

const kmText = (m: number) => m < 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;

/** Formats a list of POIs into a short AI-context sentence. Returns '' for empty input. */
export function formatPOINote(pois: POI[]): string {
  if (!pois.length) return '';
  return `Nearby places: ${pois.map((p) => `${p.name} ${p.kind} (${kmText(p.distanceM)} ${p.direction})`).join(', ')}.`;
}

// In-memory cache; survives for 10 minutes.
let _cache: { note: string; expiresAt: number } = { note: '', expiresAt: 0 };

/** Returns the cached POI note (empty string if none or expired). */
export function getCachedPOINote(): string {
  return Date.now() < _cache.expiresAt ? _cache.note : '';
}

/** Fetches POIs for the current GPS fix and caches the result for 10 minutes. No-ops if location sharing is off or no fix. */
export async function refreshNearbyPOI(): Promise<void> {
  try {
    if (useAppStore.getState().settings.shareLocation === false) return;
    const fix = useMaps.getState().lastFix;
    if (!fix) return;
    const pois = await fetchNearbyPOI(fix.lat, fix.lon);
    _cache = { note: formatPOINote(pois), expiresAt: Date.now() + 10 * 60 * 1000 };
  } catch { /* non-critical */ }
}
