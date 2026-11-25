// AtlasDevice, AtlasSensor, DeviceMemoryModule, AtlasMediaControls, AtlasShare for the web / desktop builds,
// from browser APIs: Geolocation, DeviceOrientation, Generic Sensor, Wake Lock, MediaSession, Web Share.
import { bus, registerNativeModule } from './registry';
import * as crypto_ from './crypto';
import { fs, norm, baseName } from '../host/fs';
import { blobUrlFor, saveToUser } from '../host/files';
import { mapInfo, mapPlaces } from '../map/places';
import { setBusy } from '../host/busy';

const nav: any = typeof navigator !== 'undefined' ? navigator : {};
const host = () => (globalThis as any).atlasHost;

// ---- wake lock / torch ---------------------------------------------------------------------------
let screenLock: any = null;
let aiLock: any = null;
async function lock(kind: 'screen', want: boolean, held: any): Promise<any> {
  try {
    if (want && !held && nav.wakeLock) return await nav.wakeLock.request(kind);
    if (!want && held) await held.release();
  } catch { /* not allowed in a background tab */ }
  return want ? held : null;
}
let torchStream: MediaStream | null = null;
async function setTorch(on: boolean) {
  try {
    if (!on) {
      torchStream?.getTracks().forEach((t) => t.stop());
      torchStream = null;
      return true;
    }
    torchStream ??= await nav.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const track = torchStream!.getVideoTracks()[0];
    await track.applyConstraints({ advanced: [{ torch: true } as any] });
    return true;
  } catch {
    return false; // desktop browsers have no torch
  }
}

// ---- location ------------------------------------------------------------------------------------
let watchId: number | null = null;
let lastFix: any = null;
const locMap = (p: GeolocationPosition) => ({
  lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy ?? 0,
  altitude: p.coords.altitude ?? -99999, speed: p.coords.speed ?? -1, time: p.timestamp, provider: 'web',
});
const getPos = (opts?: PositionOptions) => new Promise<GeolocationPosition>((res, rej) => nav.geolocation.getCurrentPosition(res, rej, opts));

// ---- compass / orientation -----------------------------------------------------------------------
let orientationOn = false;
let orientationHandler: ((e: any) => void) | null = null;
async function startCompass() {
  if (orientationOn) return true;
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  const req = (DeviceOrientationEvent as any).requestPermission; // iOS Safari
  if (typeof req === 'function') {
    try { if ((await req.call(DeviceOrientationEvent)) !== 'granted') return false; } catch { return false; }
  }
  orientationHandler = (e: any) => {
    const heading = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : e.alpha == null ? null : (360 - e.alpha) % 360;
    if (heading == null) return;
    bus.emit('AtlasCompass', { heading });
    bus.emit('AtlasOrientation', { pitch: e.beta ?? 0, roll: e.gamma ?? 0 });
  };
  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evt, orientationHandler as any, true);
  (orientationHandler as any).__evt = evt;
  orientationOn = true;
  return true;
}
function stopCompass() {
  if (orientationHandler) window.removeEventListener((orientationHandler as any).__evt, orientationHandler as any, true);
  orientationHandler = null;
  orientationOn = false;
}

// ---- calendar (iCalendar download: the browser has no calendar API) ----------------------------------
const ics = (title: string, start: number, end: number, extra: Record<string, string>) => {
  const d = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atlas//EN', 'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@atlas`, `DTSTAMP:${d(Date.now())}`,
    `DTSTART:${d(start)}`, `DTEND:${d(end)}`, `SUMMARY:${esc(title)}`, ...Object.entries(extra).filter(([, v]) => v).map(([k, v]) => `${k}:${k === 'RRULE' ? v : esc(v)}`), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
};
async function downloadText(name: string, text: string, mime: string) {
  const dest = `/atlas/cache/${Date.now()}-${name}`;
  await fs().writeFile(dest, text);
  await saveToUser(dest, name, mime);
}

registerNativeModule('AtlasDevice', {
  addListener() {}, removeListeners() {},
  async setKeepScreenOn(on: boolean) { screenLock = await lock('screen', on, screenLock); return true; },
  async setAiWorkActive(on: boolean) { setBusy('ai', on); aiLock = await lock('screen', on, aiLock); return true; },
  async setTorch(on: boolean) { return setTorch(on); },
  async magneticDeclination() { return 0; },
  async hasCompass() { return typeof DeviceOrientationEvent !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0); },
  startCompass, async stopCompass() { stopCompass(); return true; },
  async startLocation() {
    if (!nav.geolocation) return false;
    if (watchId != null) return true;
    try {
      const first = await getPos({ enableHighAccuracy: true, timeout: 20000 });
      lastFix = locMap(first);
      bus.emit('AtlasLocation', lastFix);
    } catch { return false; }
    watchId = nav.geolocation.watchPosition((p: GeolocationPosition) => { lastFix = locMap(p); bus.emit('AtlasLocation', lastFix); }, () => undefined, { enableHighAccuracy: true, maximumAge: 5000 });
    return true;
  },
  async stopLocation() { if (watchId != null) nav.geolocation.clearWatch(watchId); watchId = null; return true; },
  async lastLocation() {
    if (lastFix) return lastFix;
    try {
      if (nav.permissions && (await nav.permissions.query({ name: 'geolocation' })).state !== 'granted') return null;
      lastFix = locMap(await getPos({ maximumAge: 600000, timeout: 8000 }));
      return lastFix;
    } catch { return null; }
  },
  async locationEnabled() { return !!nav.geolocation; },
  async startPressure() { return false; }, async stopPressure() { return true; },
  mapInfo: (path: string) => mapInfo(path),
  mapPlaces: (path: string, lat: number, lon: number, radiusM: number, query: string, limit: number) => mapPlaces(path, lat, lon, radiusM, query, limit),
  async getBatteryTemperature() { return -999; },
  async getThermalStatus() { return -1; },
  async storageVolumes() {
    const e = await nav.storage?.estimate?.();
    return [{ path: '/atlas/storage', label: 'Browser storage', primary: true, removable: false, totalBytes: e?.quota ?? 0, freeBytes: Math.max(0, (e?.quota ?? 0) - (e?.usage ?? 0)) }];
  },
  async hasAllFilesAccess() { return true; },
  async requestAllFilesAccess() { return true; },
  async storageRoot() { return '/atlas/storage'; },
  async openFile(path: string) { window.open(await blobUrlFor(norm(path)), '_blank', 'noopener'); return true; },
  async shareFile(path: string, title: string) {
    const p = norm(path);
    const file = await fs().getFile(p);
    const f = new File([file], baseName(p), { type: file.type || 'application/octet-stream' });
    if (nav.canShare?.({ files: [f] })) {
      try { await nav.share({ files: [f], title }); return true; } catch { return false; }
    }
    if (host()?.showItemInFolder) { await host().showItemInFolder(p); return true; }
    await saveToUser(p, baseName(p));
    return true;
  },
  async installApk() { throw new Error('Updating from the app works on Android only.'); },
  async calendarEvents() { return []; },
  async addCalendarEvent(title: string, start: number, end: number, location: string, description: string) {
    await downloadText(`${title.replace(/[^\w-]+/g, '_') || 'event'}.ics`, ics(title, start, end, { LOCATION: location, DESCRIPTION: description }), 'text/calendar');
    return true;
  },
  async addRepeatingCalendarEvent(title: string, start: number, end: number, rule: string, description: string) {
    await downloadText(`${title.replace(/[^\w-]+/g, '_') || 'event'}.ics`, ics(title, start, end, { RRULE: rule, DESCRIPTION: description }), 'text/calendar');
    return true;
  },
  ...Object.fromEntries(['encryptChatState', 'decryptChatState', 'createChatPinVerifier', 'verifyChatPin', 'encryptProtectedItem', 'decryptProtectedItem', 'removeProtectedItemKey', 'encryptPortableBackup', 'decryptPortableBackup'].map((k) => [k, (crypto_ as any)[k]])),
});

// ---- generic sensors -------------------------------------------------------------------------------
const SENSORS: Record<number, { name: string; stringType: string; make: () => any; read: (s: any) => number[] }> = {
  1: { name: 'Accelerometer', stringType: 'android.sensor.accelerometer', make: () => new (window as any).Accelerometer({ frequency: 20 }), read: (s) => [s.x, s.y, s.z] },
  2: { name: 'Magnetometer', stringType: 'android.sensor.magnetic_field', make: () => new (window as any).Magnetometer({ frequency: 20 }), read: (s) => [s.x, s.y, s.z] },
  4: { name: 'Gyroscope', stringType: 'android.sensor.gyroscope', make: () => new (window as any).Gyroscope({ frequency: 20 }), read: (s) => [s.x, s.y, s.z] },
  5: { name: 'Ambient light', stringType: 'android.sensor.light', make: () => new (window as any).AmbientLightSensor({ frequency: 5 }), read: (s) => [s.illuminance] },
  9: { name: 'Gravity', stringType: 'android.sensor.gravity', make: () => new (window as any).GravitySensor({ frequency: 20 }), read: (s) => [s.x, s.y, s.z] },
  10: { name: 'Linear acceleration', stringType: 'android.sensor.linear_acceleration', make: () => new (window as any).LinearAccelerationSensor({ frequency: 20 }), read: (s) => [s.x, s.y, s.z] },
};
const live = new Map<number, any>();
const present = (type: number) => {
  const need = { 1: 'Accelerometer', 2: 'Magnetometer', 4: 'Gyroscope', 5: 'AmbientLightSensor', 9: 'GravitySensor', 10: 'LinearAccelerationSensor' }[type as 1];
  return !!need && need in window;
};
registerNativeModule('AtlasSensor', {
  addListener() {}, removeListeners() {},
  async listSensors() {
    return Object.entries(SENSORS).filter(([t]) => present(Number(t))).map(([t, s]) => ({ type: Number(t), name: s.name, vendor: 'Browser', stringType: s.stringType, maxRange: 0, resolution: 0 }));
  },
  async startSensor(type: number) {
    if (live.has(type)) return true;
    const def = SENSORS[type];
    if (!def || !present(type)) return false;
    try {
      const s = def.make();
      s.addEventListener('reading', () => bus.emit('AtlasSensorValue', { type, values: def.read(s) }));
      s.addEventListener('error', () => undefined);
      s.start();
      live.set(type, s);
      return true;
    } catch { return false; }
  },
  async stopSensor(type: number) { live.get(type)?.stop(); live.delete(type); return true; },
  async startMagnetometer() { return false; }, async stopMagnetometer() { return true; },
  async startPedometer() { return false; }, async stopPedometer() { return true; },
});

// ---- memory ------------------------------------------------------------------------------------------
const FEATURE_LIBS = ['librnllama_wasm.so', 'libsherpa-onnx_wasm.so', 'librnwhisper_wasm.so', 'libkiwix_js.so'];
registerNativeModule('DeviceMemoryModule', {
  buildInfo: { abi: 'wasm32', nativeLibs: FEATURE_LIBS },
  async getMemoryInfo() {
    const used = (performance as any).memory?.usedJSHeapSize ?? 0;
    const hostSys = host()?.system ? await host().system().catch(() => null) : null;
    if (hostSys) return { processAvailableBytes: Math.max(512 * 1024 ** 2, hostSys.freeMem * 0.9), footprintBytes: used, totalBytes: hostSys.totalMem };
    const total = (Number(nav.deviceMemory) || 4) * 1024 ** 3;
    // A browser tab can use roughly half of the reported device memory before the OS steps in.
    return { processAvailableBytes: Math.max(256 * 1024 ** 2, total * 0.5 - used), footprintBytes: used, totalBytes: total };
  },
  async getLastExitReasons() { return { supported: false, reasons: [] }; },
});

// ---- media controls ----------------------------------------------------------------------------------
registerNativeModule('AtlasMediaControls', {
  addListener() {}, removeListeners() {},
  show(title: string, text: string, playing: boolean) {
    const ms = nav.mediaSession;
    if (!ms) return;
    ms.metadata = new (window as any).MediaMetadata({ title, artist: text, album: 'Atlas' });
    ms.playbackState = playing ? 'playing' : 'paused';
    for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'stop']) {
      try { ms.setActionHandler(a, () => bus.emit('AtlasMediaAction', { action: a === 'nexttrack' ? 'next' : a === 'previoustrack' ? 'previous' : a })); } catch { /* unsupported action */ }
    }
  },
  hide() { const ms = nav.mediaSession; if (ms) { ms.metadata = null; ms.playbackState = 'none'; } },
  keepAlive() {},
});

// ---- incoming shares (PWA share target) ----------------------------------------------------------
let shareText: string | null = null;
let shareFile: string | null = null;
try {
  const u = new URL(location.href);
  const text = [u.searchParams.get('title'), u.searchParams.get('text'), u.searchParams.get('url')].filter(Boolean).join('\n');
  if (u.searchParams.has('share-target') && text) shareText = text;
  const f = u.searchParams.get('share-file');
  if (f) shareFile = JSON.stringify({ uri: f, mime: u.searchParams.get('share-mime') ?? '' });
  if (u.searchParams.has('share-target') || f) history.replaceState(null, '', u.pathname);
} catch { /* not a browser */ }
registerNativeModule('AtlasShare', {
  addListener() {}, removeListeners() {},
  async getInitialShare() { const t = shareText; shareText = null; return t; },
  async getInitialShareFile() { const f = shareFile; shareFile = null; return f; },
});
