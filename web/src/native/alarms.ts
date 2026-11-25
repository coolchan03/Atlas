// AtlasTaskAlarms: scheduled-task notifications. Timers run while the app is open (web) or running in the tray /
// background (Windows app); they are re-armed from the list the app hands over on every start.
import { registerNativeModule } from './registry';

let timers: ReturnType<typeof setTimeout>[] = [];
const MAX = 2 ** 31 - 1;

async function show(title: string, body: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) return void (await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-96.png', tag: `${title}:${body}`.slice(0, 60) }));
  } catch { /* fall through */ }
  try { new Notification(title, { body }); } catch { /* not allowed */ }
}

registerNativeModule('AtlasTaskAlarms', {
  async setAlarms(json: string) {
    for (const t of timers) clearTimeout(t);
    timers = [];
    const list = JSON.parse(json) as { id: string; at: number; title: string; body: string }[];
    for (const a of list) {
      const wait = a.at - Date.now();
      if (wait < -60_000) continue; // missed by more than a minute while the app was closed
      const arm = (ms: number) => timers.push(setTimeout(() => (a.at - Date.now() > 1000 ? arm(Math.min(MAX, a.at - Date.now())) : void show(a.title, a.body)), Math.min(MAX, Math.max(0, ms))));
      arm(wait);
    }
    return true;
  },
  async notificationsEnabled() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* ignore */ } }
    return Notification.permission === 'granted';
  },
});
