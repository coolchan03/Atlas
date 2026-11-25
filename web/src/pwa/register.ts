// Registers the service worker, handles updates, and makes the page cross-origin isolated.
export interface PwaState {
  /** An installable prompt is waiting (Chrome / Edge / Android). */
  canInstall: boolean;
  /** A new version is downloaded and will apply on the next launch (or now via applyUpdate). */
  updateReady: boolean;
  installed: boolean;
  offlineReady: boolean;
}
const state: PwaState = { canInstall: false, updateReady: false, installed: false, offlineReady: false };
const subs = new Set<(s: PwaState) => void>();
const emit = () => subs.forEach((f) => f({ ...state }));
export const subscribePwa = (f: (s: PwaState) => void) => {
  subs.add(f);
  f({ ...state });
  return () => void subs.delete(f);
};
export const getPwaState = () => ({ ...state });

let deferred: any = null;
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  state.canInstall = false;
  emit();
  return choice.outcome;
}
let waiting: ServiceWorker | null = null;
export function applyUpdate() {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
  location.reload();
}

export function setupInstallEvents() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    state.canInstall = true;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    state.installed = true;
    state.canInstall = false;
    emit();
  });
  state.installed = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export async function registerServiceWorker() {
  setupInstallEvents();
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  if ((globalThis as any).atlasHost) return; // the Windows app serves its files from disk
  try {
    const base = import.meta.env.BASE_URL;
    const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base, type: 'classic' });
    const track = (sw: ServiceWorker | null) => {
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            waiting = sw;
            state.updateReady = true;
          } else state.offlineReady = true;
          emit();
        }
      });
    };
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    if (reg.active && navigator.serviceWorker.controller) state.offlineReady = true;
    emit();
    setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    // First visit: once the worker controls the page, reload one time so the page is served with COOP/COEP.
    const ensureIsolated = () => {
      if (window.crossOriginIsolated) return;
      if (sessionStorage.getItem('atlas.coi-reload')) return;
      sessionStorage.setItem('atlas.coi-reload', '1');
      location.reload();
    };
    if (navigator.serviceWorker.controller) ensureIsolated();
    else navigator.serviceWorker.addEventListener('controllerchange', ensureIsolated, { once: true });
  } catch (e) {
    console.warn('[pwa] service worker could not register', e);
  }
}
