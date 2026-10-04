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
      s.markDone(); // hands-free mode and podcast playback listen for this
      s.setSpeaking(null);
    }
  });
  emitter.addListener('AtlasTtsNoLanguage', (e: { utteranceId: string }) => {
    noLangHandler?.(e.utteranceId);
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

/** Speak in another language (BCP-47 like 'es-ES'). Calls onNoLanguage if the phone lacks that voice. */
let noLangHandler: ((lang: string) => void) | null = null;
export function onMissingLanguage(fn: ((lang: string) => void) | null): void { noLangHandler = fn; }
export function speakIn(text: string, lang: string, messageId = 'phrase'): void {
  if (!ttsAvailable() || !text.trim()) return;
  ensureListeners();
  const key = `${messageId}~${++counter}`;
  const s = useAtlasVoiceStore.getState();
  s.setSpeaking(key, messageId);
  Native.setRate(Math.min(s.rate, 0.9)).catch(() => undefined);
  (Native.speakIn ? Native.speakIn(text, key, lang) : Native.speak(text, key)).catch(() => s.setSpeaking(null));
}

/** Speak and wait until finished (resolves false if stopped). Optional pitch for a second voice. */
export function speakAndWait(text: string, pitch = 1.0, messageId = 'podcast', voice = ''): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ttsAvailable() || !text.trim()) { resolve(true); return; }
    ensureListeners();
    const start = useAtlasVoiceStore.getState().doneTick;
    Native.setPitch?.(pitch).catch(() => undefined);
    Native.setVoice?.(voice).catch(() => undefined);
    speak(text, messageId);
    const myKey = useAtlasVoiceStore.getState().speakingKey;
    const unsub = useAtlasVoiceStore.subscribe((s) => {
      const reset = () => { Native.setPitch?.(1.0).catch(() => undefined); Native.setVoice?.('').catch(() => undefined); };
      if (s.doneTick !== start) { unsub(); reset(); resolve(true); }
      else if (s.speakingKey !== myKey) { unsub(); reset(); resolve(false); }
    });
  });
}

export interface TtsVoice { name: string; locale: string; quality: number }
/** Installed offline voices for a language (empty if the engine is still starting). */
export async function listVoices(lang = 'en'): Promise<TtsVoice[]> {
  if (!ttsAvailable() || !Native.listVoices) return [];
  ensureListeners();
  try {
    let v: TtsVoice[] = await Native.listVoices(lang);
    if (!v.length) { await new Promise((r) => setTimeout(r, 1200)); v = await Native.listVoices(lang); }
    return v;
  } catch { return []; }
}
