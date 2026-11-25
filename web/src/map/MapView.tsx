// The map view behind `requireNativeComponent('AtlasMapView')` on the web / Windows builds: draws a Mapsforge file on a
// canvas (pan with the mouse or a finger, wheel or pinch to zoom), plus saved places and the GPS position.
import * as React from 'react';
import { View } from 'react-native-web';
import { bus } from '../native/registry';
import { fs, norm } from '../host/fs';
import { MapFile, lonToX, latToY, type TileData } from '../engines/mapsforge/mapfile';
import { styleFor, tagsOf, PLACE_RANK, POI_MIN_ZOOM } from './style';

interface Props {
  style?: any;
  mapPath?: string | null;
  center?: { lat: number; lon: number; zoom?: number; nonce?: number } | null;
  markers?: { lat: number; lon: number; color?: number }[];
  me?: { lat: number; lon: number } | null;
}

const argb = (c: number | undefined, d = '#dc2626') => (c == null ? d : `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${(((c >>> 24) & 255) || 255) / 255})`);

const opened = new Map<string, Promise<MapFile>>();
export async function openMap(path: string): Promise<MapFile> {
  let p = opened.get(path);
  if (!p) {
    p = (async () => {
      const v = norm(path);
      const st = await fs().stat(v);
      let read: (pos: number, len: number) => Promise<Uint8Array>;
      if (fs().kind === 'opfs') {
        const file = await fs().getFile(v);
        read = async (pos, len) => new Uint8Array(await file.slice(pos, Math.min(st.size, pos + len)).arrayBuffer());
      } else read = (pos, len) => fs().readRange(v, pos, Math.min(len, st.size - pos));
      return MapFile.open(read, st.size);
    })();
    p.catch(() => opened.delete(path));
    opened.set(path, p);
  }
  return p;
}
export const closeMap = (path: string) => opened.delete(path);

const worldPx = (z: number) => 256 * 2 ** z;
const px = (lon: number, z: number) => ((lon + 180) / 360) * worldPx(z);
const py = (lat: number, z: number) => {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * worldPx(z);
};
const unLon = (x: number, z: number) => (x / worldPx(z)) * 360 - 180;
const unLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx(z)))) * 180) / Math.PI;

export function AtlasMapView({ style, mapPath, center, markers, me }: Props) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  const st = React.useRef({
    map: null as MapFile | null, lat: 0, lon: 0, zoom: 10, w: 0, h: 0, dirty: true, raf: 0, nonce: -1,
    tiles: new Map<string, Promise<TileData> | TileData>(), pointers: new Map<number, { x: number; y: number }>(), pinch: 0, moved: 0, emitTimer: 0 as any,
    markers: [] as NonNullable<Props['markers']>, me: null as Props['me'],
  });
  st.current.markers = markers ?? [];
  st.current.me = me ?? null;

  const invalidate = React.useCallback(() => {
    const s = st.current;
    s.dirty = true;
    if (!s.raf) s.raf = requestAnimationFrame(() => { s.raf = 0; draw(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitCenter = () => {
    const s = st.current;
    clearTimeout(s.emitTimer);
    s.emitTimer = setTimeout(() => bus.emit('AtlasMapCenter', { lat: s.lat, lon: s.lon, zoom: Math.round(s.zoom) }), 200);
  };

  const getTile = (x: number, y: number, z: number, iv: ReturnType<MapFile['intervalFor']>): TileData | null => {
    const s = st.current;
    const key = `${iv.base}:${x}:${y}:${z}`;
    const hit = s.tiles.get(key);
    if (hit && !(hit instanceof Promise)) return hit;
    if (!hit) {
      const p = s.map!.tile(x, y, z, iv).then((t) => { s.tiles.set(key, t); invalidate(); return t; }).catch(() => { const t = { pois: [], ways: [], water: false }; s.tiles.set(key, t); return t; });
      s.tiles.set(key, p);
      if (s.tiles.size > 160) for (const k of [...s.tiles.keys()].slice(0, 40)) s.tiles.delete(k);
    }
    return null;
  };

  function draw() {
    const s = st.current;
    const cv = canvas.current;
    if (!cv || !s.w || !s.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(s.w * dpr) || cv.height !== Math.round(s.h * dpr)) { cv.width = Math.round(s.w * dpr); cv.height = Math.round(s.h * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f2efe9';
    g.fillRect(0, 0, s.w, s.h);
    const z = s.zoom;
    const zi = Math.round(z);
    const cx = px(s.lon, z), cy = py(s.lat, z);
    const toX = (lon: number) => px(lon, z) - cx + s.w / 2;
    const toY = (lat: number) => py(lat, z) - cy + s.h / 2;
    if (s.map) {
      const iv = s.map.intervalFor(zi);
      const west = unLon(cx - s.w / 2, z), east = unLon(cx + s.w / 2, z), north = unLat(cy - s.h / 2, z), south = unLat(cy + s.h / 2, z);
      const x0 = lonToX(west, iv.base), x1 = lonToX(east, iv.base), y0 = latToY(north, iv.base), y1 = latToY(south, iv.base);
      const loaded: TileData[] = [];
      let pending = 0;
      for (let ty = y0; ty <= Math.min(y1, y0 + 24); ty++) for (let tx = x0; tx <= Math.min(x1, x0 + 24); tx++) {
        const t = getTile(tx, ty, zi, iv);
        if (t) loaded.push(t); else pending++;
      }
      // water-only tiles (sea) are flagged in the index
      const fills: { w: import('../engines/mapsforge/mapfile').Way; s: NonNullable<ReturnType<typeof styleFor>> }[] = [];
      const lines: typeof fills = [];
      for (const t of loaded) for (const w of t.ways) {
        const sty = styleFor(w, zi);
        if (!sty) continue;
        (sty.kind === 'fill' && w.closed ? fills : lines).push({ w, s: sty });
      }
      const path = (ring: [number, number][], close: boolean) => { g.beginPath(); ring.forEach(([la, lo], i) => (i ? g.lineTo(toX(lo), toY(la)) : g.moveTo(toX(lo), toY(la)))); if (close) g.closePath(); };
      fills.sort((a, b) => a.s.order - b.s.order);
      for (const { w, s: sty } of fills) {
        g.beginPath();
        for (const ring of w.rings) ring.forEach(([la, lo], i) => (i ? g.lineTo(toX(lo), toY(la)) : g.moveTo(toX(lo), toY(la))));
        g.fillStyle = sty.fill!;
        g.fill('evenodd');
        if (sty.stroke && sty.width) { g.strokeStyle = sty.stroke; g.lineWidth = sty.width; g.stroke(); }
      }
      lines.sort((a, b) => a.s.order - b.s.order);
      g.lineJoin = 'round'; g.lineCap = 'round';
      // roads get a darker casing underneath, then the fill colour on top
      for (const pass of [0, 1]) for (const { w, s: sty } of lines) {
        if (sty.kind !== 'line') continue;
        if (pass === 0 && (sty.order < 56 || sty.order > 120 || sty.width < 2.6)) continue;
        g.setLineDash(sty.dash ?? []);
        g.strokeStyle = pass === 0 ? '#b9b3a8' : sty.stroke!;
        g.lineWidth = pass === 0 ? sty.width + 1.6 : sty.width;
        for (const ring of w.rings) { path(ring, false); g.stroke(); }
      }
      g.setLineDash([]);
      // labels
      const taken: [number, number, number, number][] = [];
      const label = (text: string, x: number, y: number, size: number, bold: boolean, color = '#333') => {
        g.font = `${bold ? '600 ' : ''}${size}px system-ui, sans-serif`;
        const wd = g.measureText(text).width;
        const box: [number, number, number, number] = [x - wd / 2 - 2, y - size, x + wd / 2 + 2, y + 3];
        if (x < -40 || y < -20 || x > s.w + 40 || y > s.h + 20) return;
        if (taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
        taken.push(box);
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(text, x - wd / 2, y);
        g.fillStyle = color; g.fillText(text, x - wd / 2, y);
      };
      g.textBaseline = 'alphabetic';
      for (const t of loaded) for (const p of t.pois) {
        if (!p.name) continue;
        const tg = tagsOf(p.tags);
        const place = tg.place && PLACE_RANK[tg.place];
        if (place) { if (zi >= place.min) label(p.name, toX(p.lon), toY(p.lat), place.size, place.bold, '#222'); continue; }
        if (zi >= POI_MIN_ZOOM) {
          const x = toX(p.lon), y = toY(p.lat);
          g.fillStyle = '#4a7fb5'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
          label(p.name, x, y - 6, 11, false, '#2d4f73');
        }
      }
      if (zi >= 16) for (const { w } of lines) {
        if (!w.name || !w.tags.some((a) => a.startsWith('highway='))) continue;
        const at = w.label ?? w.rings[0][Math.floor(w.rings[0].length / 2)];
        label(w.name, toX(at[1]), toY(at[0]), 11, false, '#555');
      }
      if (pending && !loaded.length) { g.fillStyle = '#888'; g.font = '13px system-ui'; g.fillText('Loading map...', 14, 24); }
    }
    for (const m of s.markers) {
      const x = toX(m.lon), y = toY(m.lat);
      g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = argb(m.color); g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    }
    if (s.me) {
      const x = toX(s.me.lon), y = toY(s.me.lat);
      g.beginPath(); g.arc(x, y, 10, 0, 7); g.fillStyle = '#2563eb'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    }
    g.font = '10px system-ui'; g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillText('© OpenStreetMap contributors', 6, s.h - 6);
  }

  // open the map file
  React.useEffect(() => {
    const s = st.current;
    s.map = null;
    s.tiles.clear();
    if (!mapPath) return invalidate();
    let alive = true;
    openMap(mapPath).then((m) => {
      if (!alive) return;
      s.map = m;
      if (st.current.nonce < 0) {
        s.lat = m.info.startLat ?? (m.info.minLat + m.info.maxLat) / 2;
        s.lon = m.info.startLon ?? (m.info.minLon + m.info.maxLon) / 2;
        s.zoom = m.info.startZoom ?? 12;
      }
      emitCenter();
      invalidate();
    }).catch((e) => bus.emit('AtlasMapError', { message: String(e?.message ?? e) }));
    return () => { alive = false; };
  }, [mapPath, invalidate]);

  // center requests from the screen
  React.useEffect(() => {
    const s = st.current;
    if (!center || center.lat == null || center.lon == null) return;
    const nonce = center.nonce ?? 0;
    if (nonce === s.nonce) return;
    s.nonce = nonce;
    s.lat = center.lat; s.lon = center.lon;
    if (center.zoom != null) s.zoom = Math.max(2, Math.min(20, center.zoom));
    emitCenter(); invalidate();
  }, [center, invalidate]);

  React.useEffect(() => { invalidate(); }, [markers, me, invalidate]);

  React.useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => { st.current.w = el.clientWidth; st.current.h = el.clientHeight; invalidate(); });
    ro.observe(el);
    st.current.w = el.clientWidth; st.current.h = el.clientHeight;
    return () => ro.disconnect();
  }, [invalidate]);

  const zoomAt = (factor: number, ax?: number, ay?: number) => {
    const s = st.current;
    const nz = Math.max(2, Math.min(20, s.zoom + factor));
    if (ax != null && ay != null) { // keep the point under the cursor fixed
      const cx = px(s.lon, s.zoom), cy = py(s.lat, s.zoom);
      const wx = cx + (ax - s.w / 2), wy = cy + (ay - s.h / 2);
      const lon = unLon(wx, s.zoom), lat = unLat(wy, s.zoom);
      s.zoom = nz;
      s.lon = lon - (ax - s.w / 2) / worldPx(nz) * 360; s.lat = unLat(py(lat, nz) - (ay - s.h / 2), nz);
    } else s.zoom = nz;
    s.tiles.clear();
    emitCenter(); invalidate();
  };

  const onPointerDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); st.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = st.current;
    const prev = s.pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      s.pointers.set(e.pointerId, now);
      const [c, d] = [...s.pointers.values()];
      const d1 = Math.hypot(c.x - d.x, c.y - d.y);
      if (d0 > 0) zoomAt(Math.log2(d1 / d0));
      return;
    }
    s.pointers.set(e.pointerId, now);
    const dx = now.x - prev.x, dy = now.y - prev.y;
    const cx = px(s.lon, s.zoom) - dx, cy = py(s.lat, s.zoom) - dy;
    s.lon = unLon(cx, s.zoom); s.lat = unLat(cy, s.zoom);
    invalidate();
    emitCenter();
  };
  const onPointerUp = (e: React.PointerEvent) => { st.current.pointers.delete(e.pointerId); };
  const onWheel = (e: React.WheelEvent) => {
    const r = host.current!.getBoundingClientRect();
    zoomAt(-e.deltaY * 0.0025, e.clientX - r.left, e.clientY - r.top);
  };

  const btn: React.CSSProperties = { width: 36, height: 36, borderRadius: 6, border: '1px solid #ccc', background: 'rgba(255,255,255,.92)', fontSize: 20, lineHeight: '20px', cursor: 'pointer', color: '#222' };
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <div
        ref={host}
        style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'grab' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onWheel={onWheel} onDoubleClick={(e) => { const r = host.current!.getBoundingClientRect(); zoomAt(1, e.clientX - r.left, e.clientY - r.top); }}
      >
        <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
        <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6 }} onPointerDown={(e) => e.stopPropagation()}>
          <button aria-label="Zoom in" style={btn} onClick={() => zoomAt(1)}>+</button>
          <button aria-label="Zoom out" style={btn} onClick={() => zoomAt(-1)}>−</button>
        </div>
      </div>
    </View>
  );
}
