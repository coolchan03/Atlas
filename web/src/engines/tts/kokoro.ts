// Natural voices in the browser: Kokoro-82M (ONNX) through kokoro-js. Uses WebGPU when the browser has it,
// otherwise WASM. The model files come from the Hugging Face Hub once, then live in the browser cache
// (Cache Storage), so the voice works with no network afterwards.
import type { Chunk } from './pcmPlayer';

type Kokoro = { generate(text: string, o: { voice: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number }> };
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const INSTALLED_KEY = 'atlas.tts.kokoro.installed';

// App speaker ids -> kokoro voice names (sherpa-onnx "kokoro-multi-lang-v1_0" order, and the older 11-voice pack).
const V1 = ['af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'];
const V0 = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky', 'am_adam', 'am_michael', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'];
const VARIANT = 1000;

export const kokoroIds = ['kokoro-v1-en', 'kokoro-en'];
export const isKokoro = (id: string) => kokoroIds.includes(id);
export const speakerCount = (id: string) => (id === 'kokoro-en' ? V0.length : V1.length);
export function voiceFor(id: string, sid: number): { voice: string; depth: number } {
  const list = id === 'kokoro-en' ? V0 : V1;
  if (sid >= VARIANT) return { voice: list[sid - VARIANT] ?? list[0], depth: 0.9 };
  return { voice: list[sid] ?? list[0], depth: 1 };
}

let engine: Promise<Kokoro> | null = null;
let device = 'wasm';
export const kokoroDevice = () => device;
export const kokoroInstalled = () => { try { return localStorage.getItem(INSTALLED_KEY) === '1'; } catch { return false; } };

export function loadKokoro(onProgress?: (fraction: number) => void): Promise<Kokoro> {
  return (engine ??= (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    const gpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu && !!(await (navigator as any).gpu.requestAdapter?.().catch(() => null));
    const files = new Map<string, { loaded: number; total: number }>();
    let best = 0;
    const progress_callback = (p: any) => {
      if (p?.status === 'progress' && p.file) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let l = 0, t = 0;
        for (const f of files.values()) { l += f.loaded; t += f.total; }
        if (t) { best = Math.max(best, Math.min(0.99, l / t)); onProgress?.(best); }
      }
    };
    const attempts: Array<{ device: 'webgpu' | 'wasm'; dtype: 'fp32' | 'q8' }> = gpu ? [{ device: 'webgpu', dtype: 'fp32' }, { device: 'wasm', dtype: 'q8' }] : [{ device: 'wasm', dtype: 'q8' }];
    let lastErr: unknown;
    for (const a of attempts) {
      try {
        const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: a.dtype, device: a.device, progress_callback });
        device = a.device;
        try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* private mode */ }
        onProgress?.(1);
        return tts as unknown as Kokoro;
      } catch (e) { lastErr = e; }
    }
    engine = null;
    throw lastErr;
  })().catch((e) => { engine = null; throw e; }));
}

export async function synth(text: string, id: string, sid: number, rate = 1): Promise<Chunk> {
  const k = await loadKokoro();
  const { voice, depth } = voiceFor(id, sid);
  const out = await k.generate(text, { voice, speed: Math.max(0.5, Math.min(2, rate)) });
  // "Deep" variants play the same audio a little lower and slower, like the phone's pitch-shifted voices.
  return { samples: out.audio, rate: Math.round(out.sampling_rate * depth) };
}
export async function removeKokoro() {
  engine = null;
  try { localStorage.removeItem(INSTALLED_KEY); } catch { /* ok */ }
  try { for (const k of await caches.keys()) if (/transformers/i.test(k)) await caches.delete(k); } catch { /* ok */ }
}
