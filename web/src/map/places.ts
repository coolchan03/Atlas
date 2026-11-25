// AtlasDevice.mapInfo / mapPlaces on the in-app Mapsforge reader: named places within a radius, nearest first.
import { openMap } from './MapView';
import { lonToX, latToY } from '../engines/mapsforge/mapfile';

const ZOOM = 13;
const metres = (la1: number, lo1: number, la2: number, lo2: number) => {
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLon = (((lo2 - lo1) * Math.PI) / 180) * Math.cos((((la1 + la2) / 2) * Math.PI) / 180);
  return 6371000 * Math.sqrt(dLat * dLat + dLon * dLon);
};
const nameOf = (tags: string[], name?: string) => name ?? tags.find((t) => t.startsWith('name='))?.slice(5);
const KINDS = ['amenity', 'tourism', 'shop', 'natural', 'place', 'leisure', 'historic', 'aeroway', 'waterway', 'highway', 'railway', 'building'];
const kindOf = (tags: string[]) => {
  for (const k of KINDS) { const t = tags.find((x) => x.startsWith(k + '=')); const v = t?.slice(k.length + 1); if (v && v !== 'yes') return v.replace(/_/g, ' '); }
  return 'place';
};

export async function mapInfo(path: string) {
  const m = await openMap(path);
  return { minLat: m.info.minLat, minLon: m.info.minLon, maxLat: m.info.maxLat, maxLon: m.info.maxLon, mapDate: m.info.date };
}

export async function mapPlaces(path: string, lat: number, lon: number, radiusM: number, query: string, limit: number) {
  const m = await openMap(path);
  if (!m.contains(lat, lon)) throw new Error('That point is outside this map');
  const radius = Math.min(Math.max(radiusM, 200), 30000);
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const iv = m.intervalFor(ZOOM);
  const xa = lonToX(lon - dLon, iv.base), xb = lonToX(lon + dLon, iv.base), ya = latToY(lat + dLat, iv.base), yb = latToY(lat - dLat, iv.base);
  const x0 = Math.min(xa, xb), x1 = Math.min(Math.max(xa, xb), x0 + 14), y0 = Math.min(ya, yb), y1 = Math.min(Math.max(ya, yb), y0 + 14);
  const wanted = query.trim().toLowerCase();
  const found: { d: number; item: { name: string; kind: string; lat: number; lon: number; distanceM: number } }[] = [];
  const add = (name: string, kind: string, pLat: number, pLon: number) => {
    if (wanted && !name.toLowerCase().includes(wanted) && !kind.toLowerCase().includes(wanted)) return;
    const d = metres(lat, lon, pLat, pLon);
    if (d > radius) return;
    found.push({ d, item: { name, kind, lat: pLat, lon: pLon, distanceM: d } });
  };
  let scanned = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = await m.tile(x, y, iv.max, iv);
    for (const p of t.pois) { if (++scanned > 6000) break; const n = nameOf(p.tags, p.name); if (n) add(n, kindOf(p.tags), p.lat, p.lon); }
    for (const w of t.ways) {
      if (++scanned > 6000) break;
      const n = nameOf(w.tags, w.name);
      const at = w.label ?? w.rings[0]?.[0];
      if (n && at) add(n, kindOf(w.tags), at[0], at[1]);
    }
  }
  found.sort((a, b) => a.d - b.d);
  const seen = new Set<string>();
  const out: typeof found[number]['item'][] = [];
  for (const f of found) { if (seen.has(f.item.name.toLowerCase())) continue; seen.add(f.item.name.toLowerCase()); out.push(f.item); if (out.length >= limit) break; }
  return out;
}
