import { installNativeBoundary } from '../harness/nativeBoundary';

type Maps = typeof import('../../src/atlasMaps/maps');
const load = (): { m: Maps; RNFS: any } => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  jest.doMock('../../src/atlasTools/storage', () => ({ bigFilesBase: () => '/files', allBases: () => ['/files', '/sd'] }));
  return { m: require('../../src/atlasMaps/maps'), RNFS: require('react-native-fs') };
};
const listing = (names: string[]) => names.map((n) => `<a href="${n}">${n}</a> 10-Nov-2026 12:00 ${n.endsWith('/') ? '-' : '12M'}\n`).join('');
const okRes = (text: string) => ({ ok: true, status: 200, text: async () => text }) as unknown as Response;

describe('maps: state', () => {
  it('keeps waypoints, external maps and settings', () => {
    const { m } = load();
    const s = () => m.useMaps.getState();
    s().addWaypoint({ name: 'Camp', lat: 1, lon: 2 }); expect(s().waypoints[0]).toMatchObject({ name: 'Camp' });
    const id = s().waypoints[0].id; s().renameWaypoint(id, 'Base'); expect(s().waypoints[0].name).toBe('Base');
    s().removeWaypoint(id); expect(s().waypoints).toEqual([]);
    s().addExternal('content://a', 'A'); s().addExternal('content://a', 'A2'); expect(s().external).toEqual([{ uri: 'content://a', name: 'A2' }]);
    s().setCurrent('content://a'); s().removeExternal('content://a'); expect(s().current).toBeNull();
    s().setImperial(false); s().setFix({ lat: 1, lon: 1, accuracy: 3, altitude: 0, speed: 0, time: 1 }); expect(s()).toMatchObject({ imperial: false, lastFix: { lat: 1 } });
  });
});

describe('maps: the server listing', () => {
  it('lists folders and maps, caches, falls back to the second server, and gives a clear error', async () => {
    const { m } = load();
    const f = jest.fn(async (url: string) => (url.startsWith(m.MAP_SERVERS[0]) ? ({ ok: false, status: 503 } as Response) : okRes(listing(['../', 'europe/', 'germany.map', 'readme.txt', 'http://x/', 'south-america/', 'big_one.map']))));
    (global as any).fetch = f;
    const out = await m.browseMaps('europe/');
    expect(out.map((e) => [e.name, e.isDir, e.size])).toEqual([['europe', true, ''], ['germany', false, '12M'], ['south america', true, ''], ['big one', false, '12M']]);
    await m.browseMaps('europe/'); expect(f).toHaveBeenCalledTimes(2); // second call came from the cache
    (global as any).fetch = jest.fn(async () => okRes('<html>nothing</html>'));
    await expect(m.browseMaps('empty/')).rejects.toThrow(/Could not reach the map server .*Empty listing/);
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    await expect(m.browseMaps('x/')).rejects.toThrow(/offline/);
  });
  it('reports free space or null', async () => {
    const { m, RNFS } = load();
    RNFS.getFSInfo = jest.fn(async () => ({ freeSpace: 12345 })); expect(await m.freeSpaceBytes()).toBe(12345);
    RNFS.getFSInfo = jest.fn(async () => { throw new Error('x'); }); expect(await m.freeSpaceBytes()).toBeNull();
  });
});

describe('maps: downloads and local files', () => {
  it('refuses bad paths and non-map files', async () => {
    const { m } = load();
    for (const bad of ['', '/abs.map', 'a\\b.map', 'a?b.map', 'a#b.map', 'a/../b.map', 'a//b.map', 'a/%2e%2e/b.map', 'a b.map']) await expect(m.downloadMap(bad)).rejects.toThrow(/Invalid map download path/);
    await expect(m.downloadMap('europe/readme.txt')).rejects.toThrow(/Only Mapsforge .map files/);
    expect(m.fileNameFor('europe/germany.map')).toBe('europe_germany.map');
  });
  it('downloads, moves the file, selects it when none is chosen, and cleans up progress', async () => {
    const { m, RNFS } = load();
    RNFS.downloadFile = jest.fn(({ toFile, progress }: any) => ({ jobId: 7, promise: (async () => { progress({ contentLength: 100, bytesWritten: 50 }); progress({ contentLength: 0, bytesWritten: 0 }); await RNFS.writeFile(toFile, 'mapdata', 'utf8'); return { statusCode: 200 }; })() }));
    const target = await m.downloadMap('europe/germany.map');
    expect(target).toMatch(/europe_germany\.map$/); expect(m.useMaps.getState().current).toBe(target);
    expect(m.useMapDownloads.getState().jobs).toEqual({}); expect(m.useMapDownloads.getState().progress).toEqual({});
    expect(await RNFS.exists(target)).toBe(true);
    await m.downloadMap('europe/germany.map'); // replaces the existing file
    const list = await m.installedMaps();
    expect(list.map((x) => x.name)).toContain('germany');
  });
  it('tries the second server after an error, and gives up with the reason', async () => {
    const { m, RNFS } = load();
    let n = 0;
    RNFS.downloadFile = jest.fn(({ toFile }: any) => ({ jobId: ++n, promise: (async () => { if (n === 1) return { statusCode: 500 }; await RNFS.writeFile(toFile, 'ok', 'utf8'); return { statusCode: 200 }; })() }));
    expect(await m.downloadMap('a/one.map')).toMatch(/a_one\.map$/);
    RNFS.downloadFile = jest.fn(() => ({ jobId: 9, promise: Promise.reject(new Error('timeout')) }));
    await expect(m.downloadMap('a/two.map')).rejects.toThrow(/Download failed: timeout/);
  });
  it('a cancelled download stops the loop', async () => {
    const { m, RNFS } = load();
    RNFS.stopDownload = jest.fn();
    RNFS.downloadFile = jest.fn(() => ({ jobId: 3, promise: (async () => { await Promise.resolve(); m.cancelMapDownload('a/c.map'); throw new Error('cancelled'); })() }));
    await expect(m.downloadMap('a/c.map')).rejects.toThrow(/Download failed/);
    expect(RNFS.downloadFile).toHaveBeenCalledTimes(1); expect(RNFS.stopDownload).toHaveBeenCalledWith(3);
    m.cancelMapDownload('never-started.map');
  });
  it('lists installed maps from every storage and deletes one, picking another as current', async () => {
    const { m, RNFS } = load();
    await RNFS.mkdir('/files/maps'); await RNFS.mkdir('/sd/maps');
    await RNFS.writeFile('/files/maps/x_zeta.map', 'z', 'utf8'); await RNFS.writeFile('/sd/maps/x_alpha-land.map', 'a', 'utf8'); await RNFS.writeFile('/files/maps/notes.txt', 'n', 'utf8');
    const list = await m.installedMaps();
    expect(list.map((x) => x.name)).toEqual(['alpha land', 'zeta']);
    m.useMaps.getState().setCurrent('/files/maps/x_zeta.map');
    await m.deleteMap('/files/maps/x_zeta.map');
    expect(m.useMaps.getState().current).toBe('/sd/maps/x_alpha-land.map');
    await m.deleteMap('/sd/maps/x_alpha-land.map'); expect(m.useMaps.getState().current).toBeNull();
  });
});

describe('maps: GPS', () => {
  it('validates fixes and formats distances, bearings and coordinates', () => {
    const { m } = load();
    const ok = { lat: 10, lon: 20, accuracy: 5, altitude: 0, speed: 0, time: 1 };
    expect(m.isValidGpsFix(ok)).toBe(true);
    for (const bad of [null, undefined, { ...ok, lat: 91 }, { ...ok, lon: -181 }, { ...ok, accuracy: -1 }, { ...ok, lat: NaN }]) expect(m.isValidGpsFix(bad as never)).toBe(false);
    expect(Math.round(m.distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }))).toBe(111195);
    expect(Math.round(m.bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }))).toBe(0); expect(Math.round(m.bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }))).toBe(90);
    expect([0, 45, 90, 180, 270, 315, 359].map(m.compassName)).toEqual(['N', 'NE', 'E', 'S', 'W', 'NW', 'N']);
    expect(m.fmtDistance(100, true)).toBe('328 ft'); expect(m.fmtDistance(5000, true)).toBe('3.1 mi'); expect(m.fmtDistance(20000, true)).toBe('12 mi');
    expect(m.fmtDistance(900, false)).toBe('900 m'); expect(m.fmtDistance(5000, false)).toBe('5.0 km'); expect(m.fmtDistance(20000, false)).toBe('20 km');
    expect(m.fmtCoord(10.5, -20.25)).toBe('10.50000°N, 20.25000°W'); expect(m.fmtCoord(-1, 1)).toBe('1.00000°S, 1.00000°E');
  });
  it('asks permission, watches the position, reports problems, and stops cleanly', async () => {
    const native: any = { startLocation: jest.fn(async () => undefined), stopLocation: jest.fn(async () => undefined), lastLocation: jest.fn(async () => ({ lat: 1, lon: 2, accuracy: 3, altitude: 0, speed: 0, time: 1 })), addListener: jest.fn(), removeListeners: jest.fn() };
    const handlers: Record<string, (f: unknown) => void> = {};
    const remove = jest.fn();
    const fresh = (nativeObj: unknown): { fresh: Maps; rn: any } => {
      jest.resetModules(); installNativeBoundary({ fs: true });
      jest.doMock('../../src/atlasTools/storage', () => ({ bigFilesBase: () => '/files', allBases: () => ['/files'] }));
      const rn = require('react-native'); rn.NativeModules.AtlasDevice = nativeObj;
      Object.defineProperty(rn, 'NativeEventEmitter', { configurable: true, value: function Emitter() { return { addListener: (name: string, cb: (f: unknown) => void) => { handlers[name] = cb; return { remove }; } }; } });
      return { fresh: require('../../src/atlasMaps/maps'), rn };
    };
    const { fresh: maps, rn } = fresh(native);
    const P = rn.PermissionsAndroid;
    const errors: string[] = [];
    jest.spyOn(P, 'requestMultiple').mockResolvedValueOnce({ [P.PERMISSIONS.ACCESS_FINE_LOCATION]: 'denied', [P.PERMISSIONS.ACCESS_COARSE_LOCATION]: 'denied' });
    await maps.watchPosition(() => undefined, (e) => errors.push(e)); expect(errors[0]).toMatch(/permission was not given/);
    jest.spyOn(P, 'requestMultiple').mockResolvedValue({ [P.PERMISSIONS.ACCESS_FINE_LOCATION]: P.RESULTS.GRANTED, [P.PERMISSIONS.ACCESS_COARSE_LOCATION]: 'denied' });
    expect(await maps.askLocationPermission()).toBe(true);
    const fixes: unknown[] = [];
    const stop = await maps.watchPosition((f) => fixes.push(f), (e) => errors.push(e));
    expect(fixes).toHaveLength(1); handlers.AtlasLocation({ lat: 99, lon: 0, accuracy: 1 }); expect(errors.at(-1)).toMatch(/invalid coordinates/);
    handlers.AtlasLocation({ lat: 5, lon: 6, accuracy: 2, altitude: 0, speed: 0, time: 2 }); expect(fixes).toHaveLength(2);
    stop(); expect(remove).toHaveBeenCalled(); expect(native.stopLocation).toHaveBeenCalled();
    native.startLocation.mockRejectedValueOnce({ code: 'NO_GPS' }); await maps.watchPosition(() => undefined, (e) => errors.push(e)); expect(errors.at(-1)).toMatch(/Location is turned off/);
    native.startLocation.mockRejectedValueOnce(new Error('boom')); await maps.watchPosition(() => undefined, (e) => errors.push(e)); expect(errors.at(-1)).toBe('boom');
    const none = fresh({}).fresh;
    await none.watchPosition(() => undefined, (e) => errors.push(e)); expect(errors.at(-1)).toMatch(/not available in this build/);
  });
});
