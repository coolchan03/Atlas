// How map features are drawn: colours and widths chosen from OpenStreetMap tags (as stored in Mapsforge files).
import type { Way } from '../engines/mapsforge/mapfile';

export interface WayStyle { kind: 'fill' | 'line'; fill?: string; stroke?: string; width: number; order: number; dash?: number[]; minZoom: number }

const tagMap = (tags: string[]) => {
  const m: Record<string, string> = {};
  for (const t of tags) { const i = t.indexOf('='); if (i > 0) m[t.slice(0, i)] = t.slice(i + 1); }
  return m;
};
export const tagsOf = tagMap;

const ROAD: Record<string, { w: number; c: string; o: number; z: number }> = {
  motorway: { w: 7, c: '#e8928c', o: 70, z: 5 }, trunk: { w: 6.5, c: '#f2a58c', o: 69, z: 6 }, primary: { w: 6, c: '#f8c079', o: 68, z: 8 },
  secondary: { w: 5, c: '#f8e08a', o: 67, z: 9 }, tertiary: { w: 4.5, c: '#ffffff', o: 66, z: 11 }, unclassified: { w: 3.5, c: '#ffffff', o: 64, z: 12 },
  residential: { w: 3.5, c: '#ffffff', o: 63, z: 12 }, living_street: { w: 3, c: '#ececec', o: 62, z: 13 }, service: { w: 2, c: '#ffffff', o: 60, z: 14 },
  pedestrian: { w: 3, c: '#e9e4f0', o: 61, z: 13 }, track: { w: 2, c: '#c8a46a', o: 58, z: 13 }, path: { w: 1.4, c: '#b9876f', o: 57, z: 14 },
  footway: { w: 1.4, c: '#b9876f', o: 57, z: 14 }, cycleway: { w: 1.6, c: '#4f7fd8', o: 57, z: 14 }, steps: { w: 1.6, c: '#c06a5a', o: 57, z: 15 },
  motorway_link: { w: 4.5, c: '#e8928c', o: 70, z: 10 }, trunk_link: { w: 4, c: '#f2a58c', o: 69, z: 10 }, primary_link: { w: 4, c: '#f8c079', o: 68, z: 10 },
  secondary_link: { w: 3.5, c: '#f8e08a', o: 67, z: 11 }, tertiary_link: { w: 3, c: '#ffffff', o: 66, z: 12 },
};

export function styleFor(way: Way, zoom: number): WayStyle | null {
  const t = tagMap(way.tags);
  if (t.highway) {
    const r = ROAD[t.highway];
    if (!r || zoom < r.z) return null;
    if (t.area === 'yes') return { kind: 'fill', fill: '#f0f0e8', stroke: '#cfcfc4', width: 1, order: 20, minZoom: 14 };
    const k = Math.max(0.55, Math.min(2.8, 0.38 * 1.32 ** (zoom - 10) * 0.55 + 0.3));
    return { kind: 'line', stroke: r.c, width: r.w * k, order: r.o + (way.layer || 0) * 100, minZoom: r.z };
  }
  if (t.railway && ['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge'].includes(t.railway)) return zoom < 9 ? null : { kind: 'line', stroke: '#8a8a8a', width: 1.4, order: 55, dash: [6, 4], minZoom: 9 };
  if (t.waterway) return zoom < (t.waterway === 'river' ? 8 : 12) ? null : { kind: 'line', stroke: '#a9cdea', width: t.waterway === 'river' ? 2.4 : 1.2, order: 40, minZoom: 8 };
  if (t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.waterway === 'riverbank') return { kind: 'fill', fill: '#a9cdea', width: 0, order: 12, minZoom: 0 };
  if (t.natural === 'coastline') return { kind: 'line', stroke: '#8fb6d8', width: 1.2, order: 41, minZoom: 0 };
  if (t.natural === 'wood' || t.landuse === 'forest') return { kind: 'fill', fill: '#cfe3bd', width: 0, order: 10, minZoom: 0 };
  if (t.natural === 'beach' || t.natural === 'sand') return { kind: 'fill', fill: '#f2e8c4', width: 0, order: 10, minZoom: 10 };
  if (t.natural === 'scrub' || t.natural === 'heath' || t.natural === 'grassland') return { kind: 'fill', fill: '#dfe9cb', width: 0, order: 9, minZoom: 10 };
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'recreation_ground' || t.leisure === 'pitch' || t.leisure === 'playground') return { kind: 'fill', fill: t.leisure === 'pitch' ? '#bfe0c3' : '#cdebb0', width: 0, order: 11, minZoom: 10 };
  if (t.landuse === 'residential') return { kind: 'fill', fill: '#e9e5dc', width: 0, order: 8, minZoom: 10 };
  if (t.landuse === 'commercial' || t.landuse === 'retail') return { kind: 'fill', fill: '#f2dcd9', width: 0, order: 8, minZoom: 11 };
  if (t.landuse === 'industrial') return { kind: 'fill', fill: '#e6dce6', width: 0, order: 8, minZoom: 11 };
  if (t.landuse === 'farmland' || t.landuse === 'orchard' || t.landuse === 'vineyard') return { kind: 'fill', fill: '#eef0d5', width: 0, order: 8, minZoom: 10 };
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return { kind: 'fill', fill: '#c5dbc0', width: 0, order: 9, minZoom: 12 };
  if (t.amenity === 'hospital' || t.amenity === 'school' || t.amenity === 'university' || t.amenity === 'college') return { kind: 'fill', fill: '#eadfcf', stroke: '#d8c9b0', width: 0.8, order: 14, minZoom: 13 };
  if (t.amenity === 'parking') return { kind: 'fill', fill: '#eeeeee', stroke: '#d9d9d9', width: 0.6, order: 14, minZoom: 15 };
  if (t.building) return zoom < 15 ? null : { kind: 'fill', fill: '#d9d0c9', stroke: '#bcaea3', width: 0.8, order: 30, minZoom: 15 };
  if (t.boundary === 'administrative') return zoom < 5 ? null : { kind: 'line', stroke: '#b57ad1', width: 1, order: 45, dash: [8, 4], minZoom: 5 };
  if (t.aeroway === 'runway' || t.aeroway === 'taxiway') return { kind: 'line', stroke: '#bbbbcc', width: 4, order: 50, minZoom: 10 };
  if (t.aeroway === 'aerodrome') return { kind: 'fill', fill: '#e8e8ee', width: 0, order: 9, minZoom: 9 };
  return null;
}

export const PLACE_RANK: Record<string, { size: number; min: number; bold: boolean }> = {
  country: { size: 18, min: 3, bold: true }, state: { size: 15, min: 5, bold: true }, city: { size: 16, min: 6, bold: true },
  town: { size: 14, min: 9, bold: true }, village: { size: 12, min: 11, bold: false }, suburb: { size: 12, min: 12, bold: false },
  quarter: { size: 11, min: 13, bold: false }, hamlet: { size: 11, min: 13, bold: false }, neighbourhood: { size: 11, min: 14, bold: false },
  island: { size: 12, min: 9, bold: false },
};
export const POI_MIN_ZOOM = 16;
