import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { create } from 'zustand';
import { navigationRef } from '../utils/navigationRef';
import { useAuthStore } from '../stores';
import logger from '../utils/logger';
import type { SharedFile } from '../navigation/types';

/**
 * Text or a file (a PDF, a Word document, a picture) another app sent to Atlas (Share, or "Ask Atlas" on selected text). It waits here
 * until the app can show it: the navigation is ready and the app is not locked behind a PIN. Then the "What should Atlas do with this?"
 * screen opens.
 */
interface Incoming { text: string | null; file: SharedFile | null }
export const useIncomingShare = create<Incoming & { set: (text: string | null) => void; setFile: (file: SharedFile | null) => void }>((set) => ({
  text: null, file: null, set: (text) => set({ text }), setFile: (file) => set({ file }),
}));

interface ShareNative { getInitialShare?: () => Promise<string | null>; getInitialShareFile?: () => Promise<string | null> }
const Native: ShareNative | undefined = Platform.OS === 'android' ? NativeModules.AtlasShare : undefined;

/** A shared file as the native side reports it ({"uri","mime"} as text), or null when it is not one. Pure. */
export function parseSharedFile(json: string | null | undefined): SharedFile | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<SharedFile>;
    return typeof v.uri === 'string' && v.uri ? { uri: v.uri, mime: typeof v.mime === 'string' ? v.mime : '' } : null;
  } catch { return null; }
}

/** Opens the share screen if a share is waiting and the app is ready; otherwise keeps it waiting. Safe to call any time. */
export function flushShare(): void {
  const { text, file, set, setFile } = useIncomingShare.getState();
  if ((!text && !file) || !navigationRef.isReady()) return;
  const auth = useAuthStore.getState();
  if (auth.isEnabled && auth.isLocked) return;
  set(null); setFile(null);
  navigationRef.navigate('Share', file ? { file } : { text: text ?? '' });
}

/** Starts listening: shares waiting from the launch, and shares sent while the app runs. Returns the way to stop. */
export function startShareIntake(): () => void {
  if (!Native) return () => undefined;
  const offer = (text?: string | null) => { if (text && text.trim()) { useIncomingShare.getState().set(text); flushShare(); } };
  const offerFile = (json?: string | null) => { const file = parseSharedFile(json); if (file) { useIncomingShare.getState().setFile(file); flushShare(); } };
  Native.getInitialShare?.().then(offer).catch((e) => logger.warn('[Share] could not read the shared text', e));
  Native.getInitialShareFile?.().then(offerFile).catch((e) => logger.warn('[Share] could not read the shared file', e));
  const emitter = new NativeEventEmitter(NativeModules.AtlasShare as any);
  const subscription = emitter.addListener('AtlasShareText', offer);
  const fileSubscription = emitter.addListener('AtlasShareFile', offerFile);
  const unlocked = useAuthStore.subscribe(flushShare);
  return () => { subscription.remove(); fileSubscription.remove(); unlocked(); };
}
