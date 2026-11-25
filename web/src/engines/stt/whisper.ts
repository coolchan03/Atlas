// Offline speech recognition in the browser / desktop renderer: Whisper through transformers.js (ONNX), on
// WebGPU when available, otherwise WASM. Models are fetched from the Hugging Face Hub once and kept in the
// browser cache; nothing is sent anywhere while transcribing.
import { fs, norm } from '../../host/fs';

const HF: Record<string, string> = {
  'tiny.en': 'onnx-community/whisper-tiny.en', 'base.en': 'onnx-community/whisper-base.en', 'small.en': 'onnx-community/whisper-small.en',
  'medium.en': 'Xenova/whisper-medium.en', tiny: 'onnx-community/whisper-tiny', base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small',
  medium: 'Xenova/whisper-medium', 'large-v3-turbo': 'onnx-community/whisper-large-v3-turbo', 'large-v3': 'onnx-community/whisper-large-v3-ONNX',
};
/** ggml-<id>.bin (whisper.cpp download URL or file name) -> the id, or null. */
export const whisperIdFor = (urlOrPath: string): string | null => {
  const m = /ggml-([\w.\-]+?)\.bin(?:$|\?)/.exec(urlOrPath);
  return m && HF[m[1]] ? m[1] : null;
};
export const hfModelFor = (id: string) => HF[id];

const MARKER = 'atlas-web-whisper:v1';
export async function writeMarker(path: string, id: string) {
  // The app treats anything under 10 MB as a broken download, so the small marker is padded.
  const head = new TextEncoder().encode(JSON.stringify({ marker: MARKER, id, model: HF[id] }) + '\n');
  const out = new Uint8Array(10 * 1024 * 1024 + 4096);
  out.set(head);
  await fs().writeFile(path, out);
}
export async function readMarker(path: string): Promise<{ id: string; model: string } | null> {
  try {
    const head = new TextDecoder().decode(await fs().readRange(norm(path), 0, 400));
    const j = JSON.parse(head.split('\n')[0]);
    return j.marker === MARKER ? { id: j.id, model: j.model } : null;
  } catch { return null; }
}

type Pipe = (audio: Float32Array, o?: Record<string, unknown>) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;
const pipes = new Map<string, Promise<Pipe>>();
export let whisperDevice = 'wasm';

export function loadWhisper(model: string, onProgress?: (fraction: number) => void): Promise<Pipe> {
  let p = pipes.get(model);
  if (!p) {
    p = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const gpu = !!(navigator as any).gpu && !!(await (navigator as any).gpu.requestAdapter?.().catch(() => null));
      const files = new Map<string, { l: number; t: number }>();
      const progress_callback = (e: any) => {
        if (e?.status === 'progress' && e.file) {
          files.set(e.file, { l: e.loaded ?? 0, t: e.total ?? 0 });
          let l = 0, t = 0;
          for (const f of files.values()) { l += f.l; t += f.t; }
          if (t) onProgress?.(Math.min(0.99, l / t));
        }
      };
      const tries: any[] = gpu
        ? [{ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } }, { device: 'wasm', dtype: 'q8' }]
        : [{ device: 'wasm', dtype: 'q8' }];
      let err: unknown;
      for (const t of tries) {
        try {
          const pipe: any = await pipeline('automatic-speech-recognition', model, { ...t, progress_callback });
          whisperDevice = t.device;
          onProgress?.(1);
          return ((audio: Float32Array, o?: Record<string, unknown>) => pipe(audio, o)) as Pipe;
        } catch (e) { err = e; }
      }
      throw err;
    })();
    p.catch(() => pipes.delete(model));
    pipes.set(model, p);
  }
  return p;
}
export const unloadWhisper = (model: string) => { pipes.delete(model); };

/** Any audio file's bytes -> mono 16 kHz samples. */
export async function decodeTo16k(bytes: Uint8Array): Promise<Float32Array> {
  const Ctx = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf: AudioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const len = Math.max(1, Math.round((buf.length * 16000) / buf.sampleRate));
    const off = new OfflineAudioContext(1, len, 16000);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0).slice();
  } finally { void ctx.close?.(); }
}

export async function transcribe(model: string, id: string, audio: Float32Array, language: string | undefined, shouldStop?: () => boolean) {
  const pipe = await loadWhisper(model);
  const english = id.endsWith('.en');
  const out = await pipe(audio, {
    return_timestamps: true, chunk_length_s: 30, stride_length_s: 5,
    ...(english || !language || language === 'auto' ? {} : { language, task: 'transcribe' }),
  });
  void shouldStop;
  const segments = (out.chunks ?? []).map((c) => ({ text: c.text, t0: Math.round((c.timestamp[0] ?? 0) * 100), t1: Math.round((c.timestamp[1] ?? c.timestamp[0] ?? 0) * 100) }));
  return { result: (out.text ?? '').trim(), segments };
}
