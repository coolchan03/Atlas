/** Finding and installing a newer build: tag and version reading, the release check, the download, and the once-a-day notice. */
import { installNativeBoundary } from '../../harness/nativeBoundary';

function load(o: { os?: string; installApk?: unknown; version?: string; offGrid?: boolean; checkUpdates?: boolean } = {}) {
  jest.resetModules();
  const boundary = installNativeBoundary({ fs: true });
  const rn = require('react-native');
  rn.Platform.OS = o.os ?? 'android';
  rn.NativeModules.AtlasDevice = o.installApk === null ? undefined : { installApk: o.installApk ?? jest.fn(async () => 'started') };
  const memory = new Map<string, string>();
  const storage = { getItem: async (k: string) => memory.get(k) ?? null, setItem: async (k: string, v: string) => { memory.set(k, v); }, removeItem: async (k: string) => { memory.delete(k); } };
  jest.doMock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: storage }));
  jest.doMock('../../../src/utils/appVersion', () => ({ appVersionLabel: () => o.version ?? '0.0.170 (build 100)' }));
  jest.doMock('../../../src/atlasTools/offGrid', () => ({ offGridOn: () => !!o.offGrid }));
  const mod = require('../../../src/services/appUpdate');
  const { useAppStore } = require('../../../src/stores');
  if (o.checkUpdates === false) useAppStore.getState().updateSettings({ checkUpdates: false } as never);
  return { mod, storage, boundary, rn, RNFS: require('react-native-fs') };
}
const release = (over: Record<string, unknown> = {}) => ({ tag_name: 'atlas-120', name: 'Atlas 120', body: 'Install this APK on your phone\nFixed things.', draft: false, prerelease: false, assets: [{ name: 'Atlas.apk', browser_download_url: 'https://x/a.apk', size: 1000 }], ...over });
const fetchOf = (status: number, body: unknown) => { (global as any).fetch = jest.fn(async () => ({ status, ok: status < 400, json: async () => body })); };

describe('reading versions and releases', () => {
  it('reads build numbers from versions and tags', () => {
    const { mod } = load();
    expect(mod.buildFromVersion('0.0.148 (build 144)')).toBe(144);
    expect(mod.buildFromVersion('0.0.148')).toBeNull();
    expect(mod.buildFromVersion(undefined)).toBeNull();
    expect(mod.buildFromTag('atlas-77')).toBe(77);
    expect(mod.buildFromTag('v1.2')).toBeNull();
    expect(mod.installedBuild()).toBe(100);
    expect(load({ version: 'dev' }).mod.installedBuild()).toBeNull();
  });

  it('offers only a newer, published release with an APK', () => {
    const { mod } = load();
    expect(mod.updateFromRelease(release(), 100)).toMatchObject({ build: 120, apkUrl: 'https://x/a.apk', size: 1000, notes: 'Fixed things.' });
    expect(mod.updateFromRelease(release({ name: '' }), 100).name).toBe('Atlas build 120');
    expect(mod.updateFromRelease(release(), 120)).toBeNull();
    expect(mod.updateFromRelease(release(), null)).toBeNull();
    expect(mod.updateFromRelease(release({ draft: true }), 100)).toBeNull();
    expect(mod.updateFromRelease(release({ prerelease: true }), 100)).toBeNull();
    expect(mod.updateFromRelease(release({ tag_name: 'other' }), 100)).toBeNull();
    expect(mod.updateFromRelease(release({ assets: [] }), 100)).toBeNull();
    expect(mod.updateFromRelease(release({ assets: undefined }), 100)).toBeNull();
    expect(mod.updateFromRelease(release({ assets: [{ name: 'a.apk' }] }), 100)).toBeNull();
    expect(mod.updateFromRelease(null, 100)).toBeNull();
  });

  it('asks GitHub for the latest build, and reports errors readably', async () => {
    const { mod } = load();
    fetchOf(200, release());
    expect((await mod.checkForUpdate()).update?.build).toBe(120);
    fetchOf(404, {});
    expect((await mod.checkForUpdate()).update).toBeNull();
    fetchOf(500, {});
    await expect(mod.checkForUpdate()).rejects.toThrow('HTTP 500');
  });
});

describe('downloading and installing', () => {
  const update = { build: 120, tag: 'atlas-120', name: 'Atlas 120', apkUrl: 'https://x/a.apk', size: 1000, notes: '' };
  const wire = (t: ReturnType<typeof load>, result: { statusCode?: number; written?: number; throws?: boolean; hang?: boolean }) => {
    const gate: { finish: (v: unknown) => void } = { finish: () => undefined };
    t.RNFS.downloadFile = jest.fn((opts: { progress: (p: unknown) => void; toFile: string }) => {
      opts.progress({ bytesWritten: 500, contentLength: 1000 });
      if (result.written !== undefined) t.boundary.fs!.seedFile(opts.toFile, result.written);
      return { jobId: 7, promise: result.hang ? new Promise((r) => { gate.finish = r; }) : result.throws ? Promise.reject(new Error('network down')) : Promise.resolve({ statusCode: result.statusCode ?? 200 }) };
    });
    t.RNFS.stopDownload = jest.fn(() => gate.finish({ statusCode: 200 }));
  };

  it('downloads, checks the size and starts the installer', async () => {
    const t = load();
    wire(t, { written: 1000 });
    const progress = jest.fn();
    expect(await t.mod.downloadAndInstall(update, progress)).toBe('started');
    expect(progress).toHaveBeenCalledWith(0.5);
  });

  it.each([
    ['an HTTP error', { statusCode: 404, written: 1000 }, /HTTP 404/],
    ['a short download', { written: 100 }, /cut short/],
    ['a network failure', { throws: true }, /network down/],
  ])('fails readably on %s', async (_n, result, message) => {
    const t = load();
    wire(t, result);
    await expect(t.mod.downloadAndInstall(update, jest.fn())).rejects.toThrow(message);
  });

  it('stops when the person cancels, and refuses off Android', async () => {
    const t = load();
    wire(t, { hang: true });
    let cancel: () => void = () => undefined;
    const run = t.mod.downloadAndInstall(update, jest.fn(), (c: () => void) => { cancel = c; });
    await new Promise((r) => setImmediate(r));
    cancel();
    await expect(run).rejects.toThrow('Download cancelled');
    await expect(load({ os: 'ios' }).mod.downloadAndInstall(update, jest.fn())).rejects.toThrow('Android only');
    await expect(load({ installApk: null }).mod.downloadAndInstall(update, jest.fn())).rejects.toThrow('Android only');
  });
});

describe('the once-a-day notice', () => {
  const alertSpy = () => jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

  it('says a newer build is ready once, and then not again within the day', async () => {
    const t = load();
    fetchOf(200, release());
    const alert = alertSpy();
    await t.mod.announceUpdateOnce();
    expect(alert).toHaveBeenCalledWith('A newer Atlas is ready', expect.stringContaining('Atlas 120'), expect.any(Array));
    await t.mod.announceUpdateOnce();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('runs the buttons: skip remembers the build, open goes to settings', async () => {
    const t = load();
    fetchOf(200, release());
    const alert = alertSpy();
    await t.mod.announceUpdateOnce();
    const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find((b) => b.text === 'Open')!.onPress!();
    buttons.find((b) => b.text === 'Skip this version')!.onPress!();
    await new Promise((r) => setImmediate(r));
    expect(await t.storage.getItem('atlas-update-skipped-build')).toBe('120');
    await t.storage.removeItem('atlas-update-last-check');
    await t.mod.announceUpdateOnce();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['updates turned off', { checkUpdates: false }],
    ['off-grid mode', { offGrid: true }],
    ['iOS', { os: 'ios' }],
    ['a build with no number', { version: 'dev' }],
  ])('stays quiet with %s', async (_n, o) => {
    const t = load(o);
    fetchOf(200, release());
    const alert = alertSpy();
    await t.mod.announceUpdateOnce();
    expect(alert).not.toHaveBeenCalled();
  });

  it('says nothing when there is no newer build or GitHub cannot be reached', async () => {
    const t = load();
    fetchOf(200, release({ tag_name: 'atlas-50' }));
    const alert = alertSpy();
    await t.mod.announceUpdateOnce();
    await t.storage.removeItem('atlas-update-last-check');
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    await t.mod.announceUpdateOnce();
    expect(alert).not.toHaveBeenCalled();
  });
});

export {};
