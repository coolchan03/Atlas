/**
 * Pure helpers for joining several WAV files into one: the briefing's lines, pauses and tunes are separate files made at different
 * sample rates, and a single file needs one rate. Plain 16-bit PCM only (anything else is "nothing to use", never guessed at).
 */
import { readPcm16 } from './wavTrim';

/** The first channel of a plain PCM 16-bit WAV as samples at `rate` (resampled in a straight line when it was made at another rate), or null. */
export function monoSamplesAt(bytes: Uint8Array, rate: number): Int16Array | null {
  const pcm = readPcm16(bytes);
  if (!pcm) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = pcm.dataLength / (2 * pcm.channels);
  const at = (frame: number): number => view.getInt16(pcm.dataStart + frame * pcm.channels * 2, true);
  if (pcm.rate === rate) {
    const same = new Int16Array(frames);
    for (let i = 0; i < frames; i++) same[i] = at(i);
    return same;
  }
  const count = Math.max(0, Math.round((frames * rate) / pcm.rate));
  const out = new Int16Array(count);
  const step = pcm.rate / rate;
  for (let i = 0; i < count; i++) {
    const x = i * step;
    const a = Math.min(frames - 1, Math.floor(x));
    const b = Math.min(frames - 1, a + 1);
    out[i] = Math.round(at(a) + (at(b) - at(a)) * (x - a));
  }
  return out;
}

/** The 44 bytes that start a mono 16-bit WAV holding `frames` samples. */
export function wavHeader(rate: number, frames: number): Uint8Array {
  const data = frames * 2;
  const out = new Uint8Array(44);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + data, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, data, true);
  return out;
}

/** The sample bytes of a mono track, ready to append after a header. */
export const samplesToBytes = (samples: Int16Array): Uint8Array => new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
