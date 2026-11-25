// whisper.rn over transformers.js (see engines/stt/whisper.ts). The ggml .bin the app "downloads" is a small
// marker file that names the matching ONNX model, which is fetched into the browser cache instead.
import { fs, norm } from '../host/fs';
import { decodeTo16k, loadWhisper, readMarker, transcribe } from '../engines/stt/whisper';

export type RealtimeTranscribeEvent = {
  isCapturing: boolean;
  data?: { result: string; segments?: { text: string; t0: number; t1: number }[] };
  processTime: number;
  recordingTime: number;
};

class WhisperContextWeb {
  constructor(private id: string, private model: string) {}
  gpu = false;
  async release() {}

  transcribe(path: string, opts: { language?: string; onProgress?: (p: number) => void } = {}) {
    let stopped = false;
    const promise = (async () => {
      const audio = await decodeTo16k(await fs().readFile(norm(path)));
      opts.onProgress?.(10);
      const r = await transcribe(this.model, this.id, audio, opts.language, () => stopped);
      opts.onProgress?.(100);
      return { ...r, isAborted: stopped };
    })();
    return { stop: async () => { stopped = true; }, promise };
  }
  transcribeData(data: ArrayBuffer, opts: { language?: string } = {}) { return this.transcribe(`/atlas/cache/${Date.now()}.wav`, opts); }

  /** Live captions: the microphone is captured at 16 kHz and the audio so far is re-transcribed every few seconds. */
  async transcribeRealtime(opts: { language?: string; realtimeAudioSec?: number; realtimeAudioSliceSec?: number } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const Ctx = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    const ctx = new Ctx({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain(); mute.gain.value = 0;
    const chunks: Float32Array[] = [];
    let total = 0;
    const subs = new Set<(e: RealtimeTranscribeEvent) => void>();
    const emit = (e: RealtimeTranscribeEvent) => subs.forEach((f) => f(e));
    const t0 = performance.now();
    let busy = false, ended = false;
    const maxSamples = (opts.realtimeAudioSec ?? 30) * 16000;
    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      const d = new Float32Array(e.inputBuffer.getChannelData(0));
      chunks.push(d); total += d.length;
      while (total > maxSamples && chunks.length > 1) total -= chunks.shift()!.length;
    };
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    const snapshot = () => { const all = new Float32Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; } return all; };
    const run = async (final: boolean) => {
      if (busy && !final) return;
      busy = true;
      const started = performance.now();
      try {
        const audio = snapshot();
        if (audio.length < 8000) { if (final) emit({ isCapturing: false, data: { result: '' }, processTime: 0, recordingTime: performance.now() - t0 }); return; }
        const r = await transcribe(this.model, this.id, audio, opts.language);
        if (!ended || final) emit({ isCapturing: !final, data: { result: r.result, segments: r.segments }, processTime: performance.now() - started, recordingTime: performance.now() - t0 });
      } catch (e) { if (final) emit({ isCapturing: false, data: { result: '' }, processTime: 0, recordingTime: performance.now() - t0 }); console.warn('[whisper] realtime', e); }
      finally { busy = false; }
    };
    const timer = setInterval(() => void run(false), Math.max(1500, (opts.realtimeAudioSliceSec ?? 3) * 1000));
    const stop = async () => {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      try { proc.disconnect(); } catch { /* ok */ }
      stream.getTracks().forEach((t) => t.stop());
      while (busy) await new Promise((r) => setTimeout(r, 50));
      await run(true);
      try { await ctx.close(); } catch { /* ok */ }
    };
    return { stop, subscribe: (cb: (e: RealtimeTranscribeEvent) => void) => void subs.add(cb) };
  }
}
export type WhisperContext = WhisperContextWeb;

export async function initWhisper(o: { filePath: string }): Promise<WhisperContext> {
  const m = await readMarker(norm(o.filePath));
  if (!m) throw new Error('This speech model file was not made by the web build. Download it again from Models.');
  await loadWhisper(m.model);
  return new WhisperContextWeb(m.id, m.model);
}
export const libVersion = 'web';
