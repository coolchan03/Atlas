// Plays PCM chunks back to back through Web Audio. One instance plays one "utterance"; stop() cuts it off.
export interface Chunk { samples: Float32Array; rate: number }

let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  const Ctor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
  return (ctx ??= new Ctor({ latencyHint: 'interactive' }));
}

export class PcmQueue {
  private at = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private gain: GainNode;
  private stopped = false;
  private lastEnd: Promise<void> = Promise.resolve();
  onFirstSound?: () => void;
  private started = false;
  constructor(volume = 1) {
    const c = audioContext();
    this.gain = c.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(c.destination);
  }
  /** Queue a chunk; resolves when that chunk has finished playing. */
  push(chunk: Chunk, rate = 1): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const c = audioContext();
    if (c.state === 'suspended') void c.resume();
    const buf = c.createBuffer(1, chunk.samples.length, chunk.rate);
    buf.copyToChannel(chunk.samples as Float32Array<ArrayBuffer>, 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(this.gain);
    const startAt = Math.max(c.currentTime + 0.02, this.at);
    src.start(startAt);
    this.at = startAt + buf.duration / rate;
    this.sources.add(src);
    if (!this.started) {
      this.started = true;
      const wait = Math.max(0, (startAt - c.currentTime) * 1000);
      setTimeout(() => !this.stopped && this.onFirstSound?.(), wait);
    }
    const done = new Promise<void>((res) => { src.onended = () => { this.sources.delete(src); res(); }; });
    this.lastEnd = done;
    return done;
  }
  /** Seconds of audio still queued ahead of "now" (used to keep synthesis just ahead of playback). */
  get buffered(): number { return Math.max(0, this.at - audioContext().currentTime); }
  whenIdle(): Promise<void> { return this.lastEnd; }
  stop() {
    this.stopped = true;
    for (const s of this.sources) { try { s.onended = null; s.stop(); } catch { /* already ended */ } }
    this.sources.clear();
    try { this.gain.disconnect(); } catch { /* ok */ }
  }
}

/** 16-bit PCM WAV bytes for a mono float signal. */
export function toWav(samples: Float32Array, rate: number): Uint8Array {
  const n = samples.length;
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return out;
}

/** Decode WAV bytes (16-bit PCM or float32, any channel count) to mono float samples. */
export function fromWav(bytes: Uint8Array): Chunk {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12, fmt = 1, ch = 1, rate = 16000, bits = 16, dataAt = 44, dataLen = bytes.length - 44;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const len = v.getUint32(pos + 4, true);
    if (id === 'fmt ') { fmt = v.getUint16(pos + 8, true); ch = v.getUint16(pos + 10, true); rate = v.getUint32(pos + 12, true); bits = v.getUint16(pos + 22, true); }
    else if (id === 'data') { dataAt = pos + 8; dataLen = Math.min(len, bytes.length - dataAt); break; }
    pos += 8 + len + (len % 2);
  }
  const bps = bits / 8;
  const frames = Math.floor(dataLen / (bps * ch));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < ch; c++) {
      const o = dataAt + (i * ch + c) * bps;
      sum += fmt === 3 ? v.getFloat32(o, true) : bits === 16 ? v.getInt16(o, true) / 32768 : bits === 8 ? (v.getUint8(o) - 128) / 128 : bits === 24 ? ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608) : v.getInt32(o, true) / 2147483648;
    }
    out[i] = sum / ch;
  }
  return { samples: out, rate };
}
