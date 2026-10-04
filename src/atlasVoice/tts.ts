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
/** speakAndWait callers waiting for their own utterance to finish. */
const waiters = new Map<string, (ok: boolean) => void>();

export const ttsAvailable = (): boolean => Platform.OS === 'android' && !!Native;

function ensureListeners(): void {
  if (emitter || !ttsAvailable()) return;
  emitter = new NativeEventEmitter(Native);
  emitter.addListener('AtlasTtsStart', () => undefined);
  emitter.addListener('AtlasTtsDone', (e: { utteranceId: string }) => {
    const w = waiters.get(e.utteranceId);
    if (w) { waiters.delete(e.utteranceId); w(true); return; } // podcast / video lines: not a chat reply
    const s = useAtlasVoiceStore.getState();
    if (s.speakingKey === e.utteranceId) {
      s.markDone(); // hands-free mode and podcast playback listen for this
      s.setSpeaking(null);
    }
  });
  emitter.addListener('AtlasTtsNoLanguage', (e: { utteranceId: string }) => {
    noLangHandler?.(e.utteranceId);
  });
  emitter.addListener('AtlasTtsStopped', (e: { utteranceId: string }) => {
    const w = waiters.get(e.utteranceId);
    if (w) { waiters.delete(e.utteranceId); w(false); }
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

/** Speak and wait until finished (resolves false if stopped). Optional pitch / voice for podcast hosts. */
export function speakAndWait(text: string, pitch = 1.0, messageId = 'podcast', voice = ''): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ttsAvailable() || !text.trim()) { resolve(true); return; }
    ensureListeners();
    Native.setPitch?.(pitch).catch(() => undefined);
    Native.setVoice?.(voice).catch(() => undefined);
    const myKey = `${messageId}~${++counter}`;
    const st = useAtlasVoiceStore.getState();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      waiters.delete(myKey);
      unsub();
      Native.setPitch?.(1.0).catch(() => undefined);
      Native.setVoice?.('').catch(() => undefined);
      if (useAtlasVoiceStore.getState().speakingKey === myKey) useAtlasVoiceStore.getState().setSpeaking(null);
      resolve(ok);
    };
    // stop() (or another speech) takes over the speaking key -> this line was stopped
    const unsub = useAtlasVoiceStore.subscribe((s) => { if (s.speakingKey !== myKey) finish(false); });
    waiters.set(myKey, finish);
    st.setSpeaking(myKey, messageId);
    Native.setRate(st.rate).catch(() => undefined);
    (Native.speakIn ? Native.speakIn(text, myKey, 'en-US') : Native.speak(text, myKey)).catch(() => finish(false));
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
