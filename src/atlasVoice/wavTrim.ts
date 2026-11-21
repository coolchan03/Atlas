/**
 * Trims the silence a voice leaves at the start and end of a rendered line. Without it every line of the briefing carries a quarter second
 * or more of quiet at each end, and on the phone's background player (which plays whole files) that stacks on top of the designed pause
 * between stories. Handles only plain 16-bit PCM WAV: anything else is returned as "nothing to do", never altered. Pure.
 */
interface Pcm { rate: number; channels: number; dataStart: number; dataLength: number }

const u32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** The layout of a canonical PCM 16-bit WAV, or null for anything else (compressed, float, 8 or 24 bit, damaged). */
export function readPcm16(bytes: Uint8Array): Pcm | null {
  if (bytes.length < 44 || tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WAVE') return null;
  let rate = 0, channels = 0, ok = false;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(bytes, at);
    const size = u32(bytes, at + 4);
    if (id === 'fmt ' && size >= 16) {
      ok = u16(bytes, at + 8) === 1 && u16(bytes, at + 22) === 16; // PCM, 16 bits
      channels = u16(bytes, at + 10);
      rate = u32(bytes, at + 12);
    } else if (id === 'data') {
      // A streaming writer may leave the size as 0 or too large: take what is really there.
      const available = bytes.length - (at + 8);
      const length = size === 0 || size > available ? available : size;
      return ok && channels >= 1 && rate > 0 ? { rate, channels, dataStart: at + 8, dataLength: length - (length % (2 * channels)) } : null;
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

const LEAD_SECONDS = 0.12;
const TAIL_SECONDS = 0.08;
/** A sample below this share of full scale counts as silence (the same low threshold the player uses: soft opening vowels are not cut). */
const QUIET = 0.004 * 32768;
/** Trimming less than this much is not worth rewriting a file for. */
const MIN_SAVED_SECONDS = 0.15;

/** The line with the silence at both ends cut down to a short lead and tail, or null when it is not plain PCM or has nothing worth trimming. */
export function trimWavSilence(bytes: Uint8Array): Uint8Array | null {
  const pcm = readPcm16(bytes);
  if (!pcm) return null;
  const { rate, channels, dataStart, dataLength } = pcm;
  const frames = dataLength / (2 * channels);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const loud = (frame: number): boolean => {
    for (let c = 0; c < channels; c++) if (Math.abs(view.getInt16(dataStart + (frame * channels + c) * 2, true)) >= QUIET) return true;
    return false;
  };
  let first = 0;
  while (first < frames && !loud(first)) first++;
  if (first >= frames) return null; // all quiet: leave it alone
  let last = frames - 1;
  while (last > first && !loud(last)) last--;
  const from = Math.max(0, first - Math.round(LEAD_SECONDS * rate));
  const to = Math.min(frames, last + 1 + Math.round(TAIL_SECONDS * rate));
  if ((frames - (to - from)) / rate < MIN_SAVED_SECONDS) return null;
  const body = bytes.subarray(dataStart + from * channels * 2, dataStart + to * channels * 2);
  const out = new Uint8Array(44 + body.length);
  const w = new DataView(out.buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); w.setUint32(4, 36 + body.length, true); text(8, 'WAVE');
  text(12, 'fmt '); w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, channels, true);
  w.setUint32(24, rate, true); w.setUint32(28, rate * channels * 2, true); w.setUint16(32, channels * 2, true); w.setUint16(34, 16, true);
  text(36, 'data'); w.setUint32(40, body.length, true);
  out.set(body, 44);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map<string, number>(Array.from(B64).map((ch, i) => [ch, i]));
/** Bytes of base64 text (react-native-fs reads files as base64). */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP.get(clean[i]) ?? 0, b = LOOKUP.get(clean[i + 1]) ?? 0, c = LOOKUP.get(clean[i + 2]), d = LOOKUP.get(clean[i + 3]);
    if (o < out.length) out[o++] = (a << 2) | (b >> 4);
    if (c !== undefined && o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (c !== undefined && d !== undefined && o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}
