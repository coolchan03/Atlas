// How the web and Windows builds update themselves. The app's own updater downloads an Android package from the releases, which is
// wrong for both: the PWA updates through its service worker, and the Windows app through its installer feed.
import { applyUpdate, getPwaState, subscribePwa } from './pwa/register';

interface UpdateInfo { build: number; tag: string; name: string; apkUrl: string; size: number; notes: string }
const info = (name: string, tag: string): UpdateInfo => ({ build: 0, tag, name, apkUrl: '', size: 0, notes: '' });
const host = () => (globalThis as any).atlasHost;

const desktop = {
  async check() {
    const r = await host().update.check();
    if (r?.error) throw new Error(`Could not check for updates: ${r.error}`);
    return { current: null, update: r?.available ? info(`Atlas ${r.version ?? 'update'}`, String(r.version ?? '')) : null };
  },
  async install(_u: UpdateInfo, onProgress: (f: number) => void) {
    onProgress(0.5); // the download runs in the shell; the app restarts when it is done
    const r = await host().update.install();
    if (r?.error) throw new Error(`The update could not be installed: ${r.error}`);
    return 'started' as const;
  },
};

const web = {
  async check() {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update().catch(() => undefined);
    // A new version that is already downloaded waits for the banner; wait briefly for one that is still arriving.
    if (!getPwaState().updateReady) await new Promise<void>((res) => { const off = subscribePwa((s) => { if (s.updateReady) { off(); res(); } }); setTimeout(() => { off(); res(); }, 4000); });
    return { current: null, update: getPwaState().updateReady ? info('A new version of Atlas', 'web') : null };
  },
  async install() { applyUpdate(); return 'started' as const; },
};

export function installUpdater(): void {
  (globalThis as any).__ATLAS_UPDATER__ = host()?.update ? desktop : web;
}
