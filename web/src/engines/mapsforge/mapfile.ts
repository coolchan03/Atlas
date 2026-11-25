// A reader for Mapsforge binary map files (.map, version 3 to 5): header, tile index, POIs and ways.
// Reads only the bytes it needs, so country-sized files work from disk. Written from the published format description.
export type Reader = (pos: number, len: number) => Promise<Uint8Array>;

export interface Interval { base: number; min: number; max: number; start: number; size: number }
export interface MapInfo {
  version: number; date: number; minLat: number; minLon: number; maxLat: number; maxLon: number; tileSize: number;
  startLat?: number; startLon?: number; startZoom?: number; language?: string; comment?: string; intervals: Interval[]; debug: boolean;
}
export interface Poi { lat: number; lon: number; tags: string[]; name?: string; layer: number }
export interface Way { tags: string[]; name?: string; ref?: string; layer: number; rings: [number, number][][]; label?: [number, number]; closed: boolean }
export interface TileData { pois: Poi[]; ways: Way[]; water: boolean; /** Ways whose parsed length differed from their stored size (0 for a healthy file). */ mismatched?: number }

const td = new TextDecoder();
const MAGIC = 'mapsforge binary OSM';

class Cur {
  p = 0;
  constructor(public b: Uint8Array) {}
  u8() { return this.b[this.p++]; }
  u16() { const v = (this.b[this.p] << 8) | this.b[this.p + 1]; this.p += 2; return v; }
  i32() { const b = this.b, p = this.p; this.p += 4; return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) | 0; }
  u32() { return this.i32() >>> 0; }
  u64() { const hi = this.u32(); const lo = this.u32(); return hi * 4294967296 + lo; }
  vu() { let r = 0, s = 0, c: number; do { c = this.b[this.p++]; r += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return r; }
  vs() {
    let r = 0, s = 0, c = this.b[this.p++];
    while (c & 0x80) { r += (c & 0x7f) * 2 ** s; s += 7; c = this.b[this.p++]; }
    r += (c & 0x3f) * 2 ** s;
    return c & 0x40 ? -r : r;
  }
  i16() { const v = (this.b[this.p] << 8) | this.b[this.p + 1]; this.p += 2; return (v << 16) >> 16; }
  f32() { const v = new DataView(this.b.buffer, this.b.byteOffset + this.p, 4).getFloat32(0, false); this.p += 4; return v; }
  str() { const n = this.vu(); const s = td.decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
}

/** Mapsforge multilingual names are "lang\rname\blang\rname"; the plain first piece is the default. */
function plainName(s: string): string {
  if (!s.includes('\b') && !s.includes('\r')) return s;
  const parts = s.split('\b');
  const def = parts.find((x) => !x.includes('\r')) ?? parts[0];
  return def.includes('\r') ? def.split('\r')[1] : def;
}

export const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
export const latToY = (lat: number, z: number) => {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const tileLeftLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileTopLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export class MapFile {
  private poiTags: string[] = [];
  private wayTags: string[] = [];
  private index = new Map<string, Promise<Uint8Array>>();
  private constructor(private read: Reader, readonly size: number, readonly info: MapInfo, poiTags: string[], wayTags: string[]) {
    this.poiTags = poiTags;
    this.wayTags = wayTags;
  }

  static async open(read: Reader, size: number): Promise<MapFile> {
    const first = await read(0, Math.min(size, 64 * 1024));
    const c = new Cur(first);
    const magic = td.decode(first.subarray(0, MAGIC.length));
    if (magic !== MAGIC) throw new Error('This is not a Mapsforge map file.');
    c.p = MAGIC.length;
    const headerSize = c.u32();
    const raw = headerSize + c.p > first.length ? await read(0, headerSize + c.p) : first;
    const h = new Cur(raw);
    h.p = c.p;
    const version = h.u32();
    h.u64(); // file size
    const date = h.u64();
    const minLat = h.i32() / 1e6, minLon = h.i32() / 1e6, maxLat = h.i32() / 1e6, maxLon = h.i32() / 1e6;
    const tileSize = h.u16();
    h.str(); // projection
    const flags = h.u8();
    const info: MapInfo = { version, date, minLat, minLon, maxLat, maxLon, tileSize, intervals: [], debug: !!(flags & 0x80) };
    if (flags & 0x40) { info.startLat = h.i32() / 1e6; info.startLon = h.i32() / 1e6; }
    if (flags & 0x20) info.startZoom = h.u8();
    if (flags & 0x10) info.language = h.str();
    if (flags & 0x08) info.comment = h.str();
    if (flags & 0x04) h.str();
    const poiTags: string[] = [];
    for (let i = 0, n = h.u16(); i < n; i++) poiTags.push(h.str());
    const wayTags: string[] = [];
    for (let i = 0, n = h.u16(); i < n; i++) wayTags.push(h.str());
    for (let i = 0, n = h.u8(); i < n; i++) info.intervals.push({ base: h.u8(), min: h.u8(), max: h.u8(), start: h.u64(), size: h.u64() });
    return new MapFile(read, size, info, poiTags, wayTags);
  }

  intervalFor(zoom: number): Interval {
    const z = Math.max(0, Math.round(zoom));
    return this.info.intervals.find((i) => z >= i.min && z <= i.max) ?? (z < this.info.intervals[0].min ? this.info.intervals[0] : this.info.intervals[this.info.intervals.length - 1]);
  }
  private grid(iv: Interval) {
    const x0 = lonToX(this.info.minLon, iv.base), x1 = lonToX(this.info.maxLon, iv.base);
    const y0 = latToY(this.info.maxLat, iv.base), y1 = latToY(this.info.minLat, iv.base);
    return { x0, x1, y0, y1, cols: x1 - x0 + 1, rows: y1 - y0 + 1 };
  }
  contains(lat: number, lon: number) { return lat >= this.info.minLat && lat <= this.info.maxLat && lon >= this.info.minLon && lon <= this.info.maxLon; }

  private async indexEntry(iv: Interval, i: number): Promise<{ offset: number; water: boolean } | null> {
    // The index is read in blocks of 4096 entries and kept.
    const g = this.grid(iv);
    const total = g.cols * g.rows;
    if (i < 0 || i >= total) return null;
    const block = Math.floor(i / 4096);
    const key = `${iv.base}:${block}`;
    let p = this.index.get(key);
    if (!p) {
      const skip = this.info.debug ? 16 : 0;
      const count = Math.min(4096, total - block * 4096);
      p = this.read(iv.start + skip + block * 4096 * 5, count * 5);
      this.index.set(key, p);
    }
    const b = await p;
    const o = (i - block * 4096) * 5;
    const hi = b[o], rest = b[o + 1] * 2 ** 24 + (b[o + 2] << 16) + (b[o + 3] << 8) + b[o + 4];
    return { offset: (hi & 0x7f) * 2 ** 32 + rest, water: !!(hi & 0x80) };
  }

  /** Everything in one base-zoom tile that is visible at `zoom` (zoom within the interval). */
  async tile(x: number, y: number, zoom: number, iv = this.intervalFor(zoom)): Promise<TileData> {
    const g = this.grid(iv);
    if (x < g.x0 || x > g.x1 || y < g.y0 || y > g.y1) return { pois: [], ways: [], water: false };
    const i = (y - g.y0) * g.cols + (x - g.x0);
    const e = await this.indexEntry(iv, i);
    if (!e) return { pois: [], ways: [], water: false };
    let next = iv.size;
    const n = await this.indexEntry(iv, i + 1);
    if (n) next = n.offset;
    const len = Math.max(0, Math.min(next, iv.size) - e.offset);
    if (len <= 0) return { pois: [], ways: [], water: e.water };
    const data = await this.read(iv.start + e.offset, len);
    return this.decode(new Cur(data), x, y, iv, Math.min(Math.max(Math.round(zoom), iv.min), iv.max), e.water);
  }

  /** Tag ids first; a tag whose value is a placeholder (%b byte, %i int, %f float, %h short, %s string) then has its value stored after the ids. */
  private readTags(c: Cur, count: number, table: string[]): string[] {
    const ids: number[] = [];
    for (let t = 0; t < count; t++) ids.push(c.vu());
    return ids.map((id) => {
      const tag = table[id] ?? '';
      const eq = tag.indexOf('=');
      const value = eq >= 0 ? tag.slice(eq + 1) : '';
      if (value.length === 2 && value[0] === '%') {
        const key = tag.slice(0, eq);
        switch (value[1]) {
          case 'b': return `${key}=${c.u8()}`;
          case 'i': return `${key}=${c.i32()}`;
          case 'f': return `${key}=${c.f32()}`;
          case 'h': return `${key}=${c.i16()}`;
          case 's': return `${key}=${c.str()}`;
        }
      }
      return tag;
    });
  }

  private decode(c: Cur, x: number, y: number, iv: Interval, zoom: number, water: boolean): TileData {
    const dbg = this.info.debug;
    const topLat = Math.round(tileTopLat(y, iv.base) * 1e6), leftLon = Math.round(tileLeftLon(x, iv.base) * 1e6);
    if (dbg) c.p += 32;
    const levels = iv.max - iv.min + 1;
    const poiCounts: number[] = [], wayCounts: number[] = [];
    for (let i = 0; i < levels; i++) { poiCounts.push(c.vu()); wayCounts.push(c.vu()); }
    const firstWay = c.vu();
    const wayStart = c.p + firstWay;
    const upTo = zoom - iv.min;
    let poiN = 0, wayN = 0, poiAll = 0, wayAll = 0;
    for (let i = 0; i < levels; i++) { poiAll += poiCounts[i]; wayAll += wayCounts[i]; if (i <= upTo) { poiN += poiCounts[i]; wayN += wayCounts[i]; } }
    const pois: Poi[] = [], ways: Way[] = [];
    let mismatched = 0;
    for (let k = 0; k < poiAll && k < 200000; k++) {
      if (dbg) c.p += 32;
      const lat = topLat + c.vs(), lon = leftLon + c.vs();
      const special = c.u8();
      const layer = (special >> 4) - 5;
      const tags = this.readTags(c, special & 15, this.poiTags);
      const flags = c.u8();
      let name: string | undefined;
      if (flags & 0x80) name = plainName(c.str());
      if (flags & 0x40) c.str();
      if (flags & 0x20) c.vs();
      if (k < poiN) pois.push({ lat: lat / 1e6, lon: lon / 1e6, tags, name, layer });
    }
    c.p = wayStart;
    for (let k = 0; k < wayAll && k < 200000 && c.p < c.b.length; k++) {
      if (dbg) c.p += 32;
      const size = c.vu();
      const end = c.p + size;
      if (k >= wayN) { c.p = end; continue; }
      c.p += 2; // sub tile bitmap
      const special = c.u8();
      const layer = (special >> 4) - 5;
      const tags = this.readTags(c, special & 15, this.wayTags);
      const flags = c.u8();
      let name: string | undefined, ref: string | undefined;
      if (flags & 0x80) name = plainName(c.str());
      if (flags & 0x40) c.str();
      if (flags & 0x20) ref = c.str();
      let labelOff: [number, number] | null = null;
      if (flags & 0x10) labelOff = [c.vs(), c.vs()];
      const blocks = flags & 0x08 ? c.vu() : 1;
      const dd = !!(flags & 0x04);
      const rings: [number, number][][] = [];
      let label: [number, number] | undefined;
      for (let b = 0; b < blocks; b++) {
        const nRings = c.vu();
        for (let r = 0; r < nRings; r++) {
          const nodes = c.vu();
          const ring: [number, number][] = [];
          let lat = topLat + c.vs(), lon = leftLon + c.vs();
          ring.push([lat / 1e6, lon / 1e6]);
          if (b === 0 && r === 0 && labelOff) label = [(lat + labelOff[0]) / 1e6, (lon + labelOff[1]) / 1e6];
          let dLat = 0, dLon = 0;
          for (let j = 1; j < nodes; j++) {
            const a = c.vs(), o = c.vs();
            if (dd) { dLat += a; dLon += o; lat += dLat; lon += dLon; } else { lat += a; lon += o; }
            ring.push([lat / 1e6, lon / 1e6]);
          }
          rings.push(ring);
        }
      }
      if (c.p !== end) mismatched++;
      c.p = end;
      const first = rings[0]?.[0], last = rings[0]?.[rings[0].length - 1];
      ways.push({ tags, name, ref, layer, rings, label, closed: !!first && !!last && first[0] === last[0] && first[1] === last[1] });
    }
    return { pois, ways, water, mismatched };
  }
}
