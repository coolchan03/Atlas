import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { useAtlasVoiceStore } from './store';
import logger from '../utils/logger';

/**
 * Thin wrapper over the AtlasTts native module (Android's built-in text-to-speech).
 * The phone's own voice engine - no download needed, works offline once the
 * engine's voice data is on the phone.
 */
const Native: any = NativeModules.AtlasTts;
let emitter: NativeEventEmitter | null = null;
let counter = 0;

export const ttsAvailable = (): boolean => Platform.OS === 'android' && !!Native;

function ensureListeners(): void {
  if (emitter || !ttsAvailable()) return;
  emitter = new NativeEventEmitter(Native);
  emitter.addListener('AtlasTtsStart', (e: { utteranceId: string }) => {
    useAtlasVoiceStore.getState().setSpeaking(e.utteranceId);
  });
  emitter.addListener('AtlasTtsDone', (e: { utteranceId: string }) => {
    const s = useAtlasVoiceStore.getState();
    if (s.speakingKey === e.utteranceId || s.speakingKey === null) {
      s.setSpeaking(null);
      s.markDone(); // hands-free mode listens for this to open the mic again
    }
  });
  emitter.addListener('AtlasTtsStopped', (e: { utteranceId: string }) => {
    const s = useAtlasVoiceStore.getState();
    if (s.speakingKey === e.utteranceId) s.setSpeaking(null);
  });
}

export function warmUp(): void {
  if (!ttsAvailable()) return;
  ensureListeners();
  Native.warmUp().catch(() => undefined);
}

/** Speak text. `messageId` lets a speak button know it is the one playing. */
export function speak(text: string, messageId?: string): void {
  if (!ttsAvailable() || !text.trim()) return;
  ensureListeners();
  const key = `${messageId ?? 'msg'}~${++counter}`;
  const s = useAtlasVoiceStore.getState();
  s.setSpeaking(key, messageId ?? null);
  Native.setRate(s.rate).catch(() => undefined);
  Native.speak(text, key).catch((err: unknown) => {
    logger.error('[AtlasTts] speak failed', err);
    s.setSpeaking(null);
  });
}

export function stop(): void {
  if (!ttsAvailable()) return;
  useAtlasVoiceStore.getState().setSpeaking(null);
  Native.stop().catch(() => undefined);
}

/** Keep the screen awake (learning mode). */
export function keepScreenOn(on: boolean): void {
  if (!ttsAvailable()) return;
  Native.keepScreenOn?.(on).catch(() => undefined);
}
