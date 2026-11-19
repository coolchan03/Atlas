import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * Qualcomm GenieX text engine (Snapdragon 8 Elite and 8 Elite Gen 5). It exists only in a build made with -PatlasGeniex=true; a normal APK
 * reports "not packaged" and nothing else changes. It never replaces llama.rn on its own: it is chosen explicitly, or measured against
 * llama.rn (see compareOnPhone) before anyone decides to use it.
 */
export type GeniexStatus = { packaged: boolean; soc: string; chipSupported: boolean; reason: string };
export type GeniexTimings = { ttftMs: number; prefillTps: number; decodeTps: number; promptTokens: number; generatedTokens: number; stopReason: string };
type Native = {
  status(): Promise<GeniexStatus>;
  load(modelPath: string, contextLength: number, npu: boolean): Promise<boolean>;
  generate(sessionId: string, messages: Array<{ role: string; content: string }>, maxTokens: number, temperature: number): Promise<boolean>;
  stop(): Promise<boolean>;
  unload(): Promise<boolean>;
};
const native = (): Native | null => (NativeModules.AtlasGeniex as Native | undefined) ?? null;

/** Whether GenieX can be used here, with the reason when it cannot (not in this APK, or a chip it does not support). */
export async function geniexStatus(): Promise<GeniexStatus> {
  const n = native();
  if (!n) return { packaged: false, soc: '', chipSupported: false, reason: 'GenieX is not in this APK.' };
  try { return await n.status(); } catch (e: any) { return { packaged: false, soc: '', chipSupported: false, reason: String(e?.message || e) }; }
}

export const geniexUsable = (s: GeniexStatus): boolean => s.packaged && s.chipSupported;

export async function loadGeniex(modelPath: string, opts: { contextLength?: number; npu?: boolean } = {}): Promise<void> {
  const n = native();
  const status = await geniexStatus();
  if (!n || !geniexUsable(status)) throw new Error(status.reason || 'GenieX is not available on this phone.');
  await n.load(modelPath, opts.contextLength ?? 4096, opts.npu ?? true);
}

let counter = 0;
/** Writes one reply. Resolves with the whole text and GenieX's own timings; rejects on an error or when `signal` aborts (the native reply is stopped). */
export function generateGeniex(messages: Array<{ role: string; content: string }>, o: { maxTokens?: number; temperature?: number; onToken?: (t: string) => void; signal?: AbortSignal } = {}): Promise<{ text: string; timings: GeniexTimings; firstTokenAt?: number }> {
  const n = native();
  if (!n) return Promise.reject(new Error('GenieX is not in this APK.'));
  const id = `geniex-${Date.now()}-${(counter += 1)}`;
  const emitter = new NativeEventEmitter(NativeModules.AtlasGeniex);
  return new Promise((resolve, reject) => {
    let text = '';
    let firstTokenAt: number | undefined;
    const subs: Array<{ remove: () => void }> = [];
    const finish = (fn: () => void) => { subs.forEach((s) => s.remove()); o.signal?.removeEventListener?.('abort', onAbort); fn(); };
    const onAbort = () => { void n.stop(); finish(() => reject(new Error('Stopped.'))); };
    subs.push(emitter.addListener('GeniexToken', (e: { sessionId: string; text: string }) => {
      if (e.sessionId !== id) return;
      firstTokenAt ??= Date.now();
      text += e.text; o.onToken?.(e.text);
    }));
    subs.push(emitter.addListener('GeniexDone', (e: GeniexTimings & { sessionId: string }) => {
      if (e.sessionId !== id) return;
      finish(() => resolve({ text, timings: { ttftMs: e.ttftMs, prefillTps: e.prefillTps, decodeTps: e.decodeTps, promptTokens: e.promptTokens, generatedTokens: e.generatedTokens, stopReason: e.stopReason }, firstTokenAt }));
    }));
    subs.push(emitter.addListener('GeniexError', (e: { sessionId: string; message: string }) => {
      if (e.sessionId !== id) return;
      finish(() => reject(new Error(e.message)));
    }));
    if (o.signal?.aborted) { onAbort(); return; }
    o.signal?.addEventListener?.('abort', onAbort);
    n.generate(id, messages, o.maxTokens ?? 512, o.temperature ?? 0.7).catch((e) => finish(() => reject(e)));
  });
}

export const stopGeniex = async (): Promise<void> => { await native()?.stop(); };
export const unloadGeniex = async (): Promise<void> => { await native()?.unload(); };
