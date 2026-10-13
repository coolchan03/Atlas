import { NativeModules, Platform } from 'react-native';

/**
 * Screenshot / recent-apps protection (Android FLAG_SECURE), reference-counted so
 * a PIN screen closing does not switch off protection another screen still needs.
 */
const holders = new Set<string>();

function apply(): void {
  if (Platform.OS !== 'android') return;
  try { NativeModules.AtlasDevice?.setSecure?.(holders.size > 0)?.catch?.(() => undefined); } catch { /* older build */ }
}

export function setScreenSecure(holder: string, on: boolean): void {
  const had = holders.size > 0;
  if (on) holders.add(holder); else holders.delete(holder);
  if (had !== holders.size > 0) apply();
}

/** Apply the saved "Block screenshots" setting at startup. */
export function initScreenSecure(): void {
  try {
    const { useChatPrefs } = require('./chatPrefs');
    const run = () => setScreenSecure('settings', !!useChatPrefs.getState().blockScreenshots);
    const p: any = (useChatPrefs as any).persist;
    if (p?.hasHydrated?.()) run(); else p?.onFinishHydration?.(run);
  } catch { /* store unavailable */ }
}
