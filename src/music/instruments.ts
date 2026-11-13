/**
 * The instruments of the built-in composer. Each is a small physical recipe, not a recording:
 * - piano: two slightly detuned strings (so notes shimmer), up to 14 overtones that are a little sharp like real strings, the hammer
 *   strike point that thins some overtones, high overtones that fade first, a quick-then-slow decay, and a soft hammer thump;
 * - guitar and bass: Karplus-Strong plucked strings (a burst of noise circling a tuned delay line that loses its brightness each pass);
 * - strings and pads: two detuned sawtooth voices; organ: drawbars with a slow tremolo; electric piano and bells: FM and bell partials;
 * - drums: a swept sine kick, a snare of noise and two tones, and a metallic hi-hat made of six clashing square waves.
 * It is still synthesised, not sampled, so it will not fool anyone into thinking real players are in the room.
 */
import type { Band, MusicNote, MusicRole, SoundPreset, Voice as VoiceName } from './types';

const TAU = 2 * Math.PI;
const NYQUIST_GUARD = 9000; // partials above this are left out so they cannot alias at the lowest sample rate used

type Voice = (t: number, hz: number) => number;
/** A voice that makes all the samples of a note at once (raw, before the attack, release and gain are applied). */
type Gen = (hz: number, n: number, rate: number) => Float32Array;

/** Same noise every time, so a rendered tune never changes between plays. */
const noise = (i: number): number => (((Math.imul(i, 1103515245) + 12345) >>> 16) & 0x7fff) / 16384 - 1;

const pointwise = (fn: Voice): Gen => (hz, n, rate) => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / rate, hz);
  return out;
};

interface Partial1 { f: number; a: number; fast: number; slow?: number; mix?: number }
/**
 * Adds sinusoids with rotating phasors (no sin() per sample) and a two-stage decay each: a loud fast stage and a quiet slow one.
 * Stops early once a note has faded to nothing, so a long note costs no more than the sound it really makes.
 */
function bank(out: Float32Array, parts: Partial1[], rate: number): void {
  const n = out.length;
  for (const p of parts) {
    if (p.f >= rate * 0.45) continue;
    const w = TAU * p.f / rate; const c = Math.cos(w); const s = Math.sin(w);
    let x = 1; let y = 0; // y is sin(w t)
    const mix = p.mix ?? 1;
    let e1 = p.a * mix; let e2 = p.a * (1 - mix);
    const d1 = Math.exp(-p.fast / rate); const d2 = Math.exp(-(p.slow ?? p.fast) / rate);
    for (let i = 0; i < n; i++) {
      out[i] += y * (e1 + e2);
      const ny = y * c + x * s; const nx = x * c - y * s; x = nx; y = ny;
      e1 *= d1; e2 *= d2;
      if (e1 + e2 < 1e-5) break;
    }
  }
}

const piano: Gen = (hz, n, rate) => {
  const out = new Float32Array(n);
  const key = Math.log2(Math.max(27.5, hz) / 27.5); // 0 (lowest A) to about 7 (top)
  const inharmonic = 0.00012 * 2 ** (key * 0.55); // higher strings are stiffer: their overtones sit further above the harmonics
  const decay = Math.min(6, 0.3 + 0.0042 * hz); // low notes ring for seconds, high notes die quickly
  const parts: Partial1[] = [];
  for (const cents of [-0.4, 0.4]) {
    const base = hz * 2 ** (cents / 1200);
    for (let k = 1; k <= 14; k++) {
      const f = k * base * Math.sqrt(1 + inharmonic * k * k);
      // The hammer strikes about an eighth along the string, which thins the overtones that have a node there.
      const strike = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * k * 0.125));
      parts.push({ f, a: 0.5 * strike / k ** 1.05, fast: decay * (1 + 0.32 * (k - 1)), slow: decay * 0.2 * (1 + 0.1 * (k - 1)), mix: 0.66 });
    }
  }
  bank(out, parts, rate);
  // The hammer thump: a few milliseconds of softened noise.
  const thump = Math.min(n, Math.round(rate * 0.012)); let lp = 0;
  for (let i = 0; i < thump; i++) { lp += (noise(i * 7 + 3) - lp) * Math.min(0.9, 2200 / rate * 3); out[i] += lp * 0.5 * Math.exp(-i / (rate * 0.003)); }
  for (let i = 0; i < n; i++) out[i] *= 0.55;
  return out;
};

/**
 * Karplus-Strong: noise circles a delay line as long as one period of the note and is averaged a little each pass, so the high
 * overtones die first, just like a plucked string. A first-order all-pass tunes the fractional part of the period.
 */
function pluckedString(format: { hz: number; n: number; rate: number }, o: { bright: number; damp: number }): Float32Array {
  const { hz, n, rate } = format;
  const out = new Float32Array(n);
  const period = rate / hz - 0.5;
  const len = Math.max(2, Math.floor(period));
  const frac = Math.max(0.05, period - len);
  const c = (1 - frac) / (1 + frac);
  const buf = new Float32Array(len);
  let prev = 0;
  for (let i = 0; i < len; i++) { prev += (noise(i * 13 + 1) - prev) * o.bright; buf[i] = prev * 2.2; }
  let ptr = 0; let xPrev = 0; let yPrev = 0; let last = 0;
  for (let i = 0; i < n; i++) {
    const a = buf[ptr];
    const lp = o.damp * 0.5 * (a + last); last = a; // the average of the sample one period ago and the one before it: half a sample of delay
    const y = c * lp + xPrev - c * yPrev; xPrev = lp; yPrev = y;
    buf[ptr] = y;
    out[i] = a;
    ptr = (ptr + 1) % len;
  }
  return out;
}

const pluck: Gen = (hz, n, rate) => pluckedString({ hz, n, rate }, { bright: 0.55, damp: 0.9975 });
const driven: Gen = (hz, n, rate) => { const o = pluck(hz, n, rate); for (let i = 0; i < n; i++) o[i] = Math.tanh(3.2 * o[i]) / Math.tanh(3.2); return o; };
// A plucked bass string with a softer first strike, plus a sine for the weight of the fundamental.
const bass: Gen = (hz, n, rate) => {
  const o = pluckedString({ hz, n, rate }, { bright: 0.18, damp: 0.9985 });
  for (let i = 0; i < n; i++) { const t = i / rate; o[i] = (o[i] * 0.9 + 0.4 * Math.sin(TAU * hz * t) * Math.exp(-t * 2.2)) * Math.exp(-t * 1.3); }
  return o;
};

/** Strings and pads: two sawtooth voices, a few cents apart, with the higher overtones weaker. */
const strings: Gen = (hz, n, rate) => {
  const out = new Float32Array(n);
  const parts: Partial1[] = [];
  for (const cents of [-6, 6]) for (let k = 1; k <= 10; k++) parts.push({ f: k * hz * 2 ** (cents / 1200), a: 0.55 / k ** 1.25, fast: 0.05 });
  bank(out, parts, rate);
  return out;
};

const organ: Gen = (hz, n, rate) => {
  const out = new Float32Array(n);
  const drawbars = [1, 0.8, 0.6, 0.5, 0, 0.35, 0, 0.25];
  bank(out, drawbars.map((a, k) => ({ f: (k + 1) * hz, a: a * 0.45, fast: 0.01 })).filter((p) => p.a > 0), rate);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    out[i] *= 1 + 0.07 * Math.sin(TAU * 5.6 * t); // the slow tremolo of a rotating speaker
    if (i < 90) out[i] += 0.2 * noise(i) * (1 - i / 90); // the key click
  }
  return out;
};

const GENERATORS: Record<VoiceName, Gen> = {
  piano, pluck, driven, bass, organ, pad: strings, saw: strings,
  // Two-operator FM with a fast-fading modulator: the bright "bark" of an electric piano, then a rounder tone.
  epiano: pointwise((t, hz) => (Math.sin(TAU * hz * t + 1.7 * Math.exp(-t * 7) * Math.sin(TAU * hz * t)) + 0.22 * Math.sin(TAU * hz * 2 * t) * Math.exp(-t * 9)) * Math.exp(-t * 1.5) + 0.04 * Math.exp(-t * 60) * Math.sin(TAU * hz * 7.1 * t)),
  bell: pointwise((t, hz) => {
    let sum = 0;
    [[1, 1, 1.4], [2.76, 0.5, 2], [5.4, 0.28, 3], [8.93, 0.14, 4.5]].forEach(([ratio, amp, fade]) => {
      if (hz * ratio < NYQUIST_GUARD) sum += amp * Math.sin(TAU * hz * ratio * t) * Math.exp(-t * fade);
    });
    return sum;
  }),
  sine: pointwise((t, hz) => Math.sin(TAU * hz * t)),
};

/** Attack and release (seconds) for each voice; pads swell in and out, plucked and struck sounds start at once. */
const SHAPE: Record<VoiceName, { attack: number; release: number }> = {
  driven: { attack: 0.003, release: 0.08 }, piano: { attack: 0.004, release: 0.1 }, epiano: { attack: 0.004, release: 0.12 }, pluck: { attack: 0.003, release: 0.08 },
  organ: { attack: 0.012, release: 0.06 }, bell: { attack: 0.003, release: 0.2 }, saw: { attack: 0.01, release: 0.1 },
  pad: { attack: 0.24, release: 0.33 }, bass: { attack: 0.006, release: 0.08 }, sine: { attack: 0.05, release: 0.2 },
};

type Part = 'melody' | 'pad' | 'bass';
/** Which voice plays each part for each instrument choice. */
const KIT: Record<SoundPreset, Record<Part, VoiceName>> = {
  keys: { melody: 'piano', pad: 'pad', bass: 'bass' },
  epiano: { melody: 'epiano', pad: 'epiano', bass: 'bass' },
  guitar: { melody: 'pluck', pad: 'pluck', bass: 'bass' },
  overdrive: { melody: 'driven', pad: 'driven', bass: 'bass' },
  organ: { melody: 'organ', pad: 'organ', bass: 'bass' },
  bell: { melody: 'bell', pad: 'pad', bass: 'bass' },
  synth: { melody: 'saw', pad: 'pad', bass: 'bass' },
  ambient: { melody: 'sine', pad: 'pad', bass: 'sine' },
  // "Style band" with no band written into the tune falls back to a plain keyboard.
  band: { melody: 'piano', pad: 'pad', bass: 'bass' },
};

const partOf = (role: MusicRole | undefined): Part => (role === 'pad' || role === 'bass' ? role : 'melody');

/** One percussion hit. A low pitch is a kick, a middle one a snare, a high one a hi-hat. */
const HAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21].map((r) => r * 205.3);
const square = (hz: number, t: number): number => (Math.sin(TAU * hz * t) >= 0 ? 1 : -1);
function drumSample(pitch: number, i: number, rate: number): number {
  const t = i / rate;
  if (pitch < 60) return (Math.sin(TAU * (52 * t + 4.5 * (1 - Math.exp(-t * 28)))) + 0.25 * noise(i) * Math.exp(-t * 400)) * Math.exp(-t * 9);
  if (pitch < 86) return 0.7 * noise(i) * Math.exp(-t * 15) + 0.35 * Math.sin(TAU * 185 * t) * Math.exp(-t * 22) + 0.25 * Math.sin(TAU * 330 * t) * Math.exp(-t * 30);
  // A hi-hat or ride: six square waves at clashing frequencies, then a high-pass (the difference of neighbouring samples).
  let metal = 0;
  for (const hz of HAT_RATIOS) metal += square(hz, t);
  const rough = 0.1 * metal + 0.5 * (noise(i) - noise(i - 1));
  return rough * 0.6 * Math.exp(-t * (pitch >= 91 ? 70 : 42));
}

/** The samples of one note: its own attack and release already applied, ready to be added to the mix wherever it plays. */
export function noteWave(note: MusicNote, format: { samples: number; rate: number; preset: SoundPreset; band?: Partial<Band> }): Float32Array {
  const { samples, rate, preset, band } = format;
  const out = new Float32Array(samples);
  const role = note.role ?? 'melody';
  if (role === 'perc') {
    for (let i = 0; i < samples; i++) out[i] = drumSample(note.pitch, i, rate) * note.gain;
    return out;
  }
  const hz = 440 * 2 ** ((note.pitch - 69) / 12);
  const name = band?.[partOf(role)] ?? KIT[preset][partOf(role)];
  const raw = GENERATORS[name](hz, samples, rate);
  const { attack, release } = SHAPE[name];
  for (let i = 0; i < samples; i++) {
    const swell = Math.min(1, i / (rate * attack), (samples - i) / (rate * release));
    out[i] = raw[i] * swell * note.gain;
  }
  return out;
}
