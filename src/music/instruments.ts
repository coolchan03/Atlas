/**
 * The instruments of the built-in composer. Each is a small physical recipe, not a recording:
 * - piano: two slightly detuned strings (so notes shimmer), up to 14 overtones that are a little sharp like real strings, the hammer
 *   strike point that thins some overtones, high overtones that fade first, a quick-then-slow decay, and a soft hammer thump;
 * - guitar and bass: Karplus-Strong plucked strings (a burst of noise circling a tuned delay line that loses its brightness each pass);
 * - strings and pads: two detuned sawtooth voices; organ: drawbars with a slow tremolo; electric piano and bells: FM and bell partials;
 * - drums: a swept sine kick, a snare of noise and two tones, and a metallic hi-hat made of six clashing square waves.
 * It is still synthesised, not sampled, so it will not fool anyone into thinking real players are in the room.
 */
import type { Band, DrumKind, MusicNote, MusicRole, SoundPreset, Voice as VoiceName } from './types';

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


// ---- More instruments. Each is a small recipe like the ones above: a few partials, a breath or bow, a fade. ----

/** Breath and bow noise, low-passed, as a tiny steady hiss under a note. */
const hiss = (i: number, amount: number): number => noise(i * 5 + 11) * amount;
const vibrato = (t: number, depth: number, shape: { hz?: number; delay?: number } = {}): number => 1 + depth * Math.min(1, t / (shape.delay ?? 0.18)) * Math.sin(TAU * (shape.hz ?? 5.2) * t);

/** Sustained instruments: partial amplitudes, a vibrato, and a little breath. Every partial follows the note's own pitch. */
function sustained(amps: number[], o: { vib?: number; breath?: number; swell?: number }): Gen {
  return (hz, n, rate) => {
    const out = new Float32Array(n);
    const top = amps.length;
    for (let k = 1; k <= top; k++) {
      const a = amps[k - 1];
      if (!a || hz * k >= NYQUIST_GUARD) continue;
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        phase += TAU * hz * k * vibrato(t, o.vib ?? 0) / rate;
        out[i] += a * Math.sin(phase);
      }
    }
    if (o.breath) for (let i = 0; i < n; i++) out[i] += hiss(i, o.breath) * Math.min(1, i / (rate * 0.05));
    if (o.swell) for (let i = 0; i < n; i++) out[i] *= 0.6 + 0.4 * Math.min(1, i / (rate * o.swell));
    return out;
  };
}

const flute = sustained([1, 0.18, 0.08, 0.03], { vib: 0.006, breath: 0.05 });
const clarinet = sustained([1, 0.02, 0.5, 0.02, 0.28, 0.02, 0.14], { vib: 0.003, breath: 0.015 }); // mostly odd partials: the hollow, woody tone
const oboe = sustained([1, 0.7, 0.55, 0.45, 0.3, 0.2, 0.12, 0.06], { vib: 0.006, breath: 0.02 });
const violin = sustained([1, 0.62, 0.45, 0.34, 0.26, 0.2, 0.15, 0.1, 0.07, 0.05], { vib: 0.009, breath: 0.012, swell: 0.12 });
const cello = sustained([1, 0.7, 0.5, 0.36, 0.26, 0.17, 0.1, 0.06], { vib: 0.007, breath: 0.015, swell: 0.18 });
const trumpet = sustained([1, 0.9, 0.78, 0.6, 0.44, 0.3, 0.2, 0.12, 0.07], { vib: 0.004, breath: 0.012, swell: 0.05 });
const horn = sustained([1, 0.55, 0.32, 0.2, 0.1, 0.05], { vib: 0.003, breath: 0.012, swell: 0.1 });
const sax = sustained([1, 0.7, 0.62, 0.38, 0.3, 0.2, 0.12, 0.08], { vib: 0.007, breath: 0.035, swell: 0.06 });
const accordion = sustained([1, 0.5, 0.45, 0.4, 0.25, 0.2, 0.1], { vib: 0.002, breath: 0.01 });
const harmonica = sustained([1, 0.4, 0.5, 0.25, 0.3, 0.12], { vib: 0.004, breath: 0.03 });
const choir: Gen = (hz, n, rate) => {
  // An "ah": a few slightly detuned voices whose partials are strongest near two vowel resonances (about 700 and 1100 Hz).
  const out = new Float32Array(n);
  for (const cents of [-9, 0, 8]) {
    const base = hz * 2 ** (cents / 1200);
    for (let k = 1; k <= 12; k++) {
      const f = base * k;
      if (f >= NYQUIST_GUARD) break;
      const formant = Math.exp(-(((f - 700) / 220) ** 2)) + 0.7 * Math.exp(-(((f - 1100) / 260) ** 2)) + 0.12;
      const a = 0.3 * formant / k ** 0.6;
      for (let i = 0; i < n; i++) { const t = i / rate; out[i] += a * Math.sin(TAU * f * vibrato(t, 0.005, { hz: 5.6, delay: 0.3 }) * t); }
    }
  }
  return out;
};
const warmpad: Gen = (hz, n, rate) => { const out = new Float32Array(n); const parts: Partial1[] = []; for (const cents of [-8, 0, 8]) for (let k = 1; k <= 6; k++) parts.push({ f: k * hz * 2 ** (cents / 1200), a: 0.5 / k ** 1.6, fast: 0.04 }); bank(out, parts, rate); return out; };
const glasspad: Gen = (hz, n, rate) => { const out = new Float32Array(n); const parts: Partial1[] = []; for (const [r, a] of [[1, 1], [2, 0.5], [3.01, 0.35], [4.99, 0.2], [7.02, 0.1]]) for (const cents of [-5, 5]) parts.push({ f: hz * r * 2 ** (cents / 1200), a: a * 0.35, fast: 0.05 }); bank(out, parts, rate); return out; };

/** Struck bars and plucked or tuned-percussion sounds, each a few partials that die at their own speed. */
function struck(parts: Array<[number, number, number]>): Gen {
  return (hz, n, rate) => { const out = new Float32Array(n); bank(out, parts.map(([r, a, fast]) => ({ f: hz * r, a, fast })), rate); return out; };
}
const marimba = struck([[1, 1, 5], [4, 0.28, 14], [10, 0.08, 30]]);
const vibes = (hz: number, n: number, rate: number): Float32Array => { const o = struck([[1, 1, 1.4], [4, 0.25, 4], [10, 0.08, 10]])(hz, n, rate); for (let i = 0; i < n; i++) o[i] *= 1 + 0.18 * Math.sin(TAU * 5.5 * i / rate); return o; };
const glock = struck([[1, 1, 2.6], [2.76, 0.45, 5], [5.4, 0.25, 9], [8.93, 0.12, 14]]);
const kalimba = struck([[1, 1, 3.2], [5.4, 0.18, 9], [9.3, 0.07, 16]]);
const musicbox = struck([[1, 1, 2.2], [3, 0.12, 5], [6.3, 0.2, 7], [9.1, 0.08, 12]]);
const steeldrum = struck([[1, 1, 3], [2.0, 0.62, 4.2], [3.0, 0.4, 5.5], [4.05, 0.2, 8]]);
const harp: Gen = (hz, n, rate) => pluckedString({ hz, n, rate }, { bright: 0.75, damp: 0.9988 });
const banjo: Gen = (hz, n, rate) => { const o = pluckedString({ hz, n, rate }, { bright: 0.95, damp: 0.994 }); for (let i = 0; i < n; i++) o[i] *= Math.exp(-i / (rate * 0.55)); return o; };
const harpsichord: Gen = (hz, n, rate) => { const o = pluckedString({ hz, n, rate }, { bright: 0.9, damp: 0.9965 }); for (let i = 0; i < n; i++) o[i] *= Math.exp(-i / (rate * 0.7)); return o; };
const upright: Gen = (hz, n, rate) => { const o = pluckedString({ hz, n, rate }, { bright: 0.12, damp: 0.9975 }); for (let i = 0; i < n; i++) { const t = i / rate; o[i] = (o[i] * 0.85 + 0.3 * Math.sin(TAU * hz * t) * Math.exp(-t * 3)) * Math.exp(-t * 2.4); } return o; };
const squarelead: Gen = (hz, n, rate) => { const out = new Float32Array(n); const parts: Partial1[] = []; for (let k = 1; k <= 15; k += 2) parts.push({ f: k * hz, a: 0.6 / k, fast: 0.02 }); bank(out, parts, rate); return out; };
const synthpluck: Gen = (hz, n, rate) => { const out = new Float32Array(n); const parts: Partial1[] = []; for (let k = 1; k <= 8; k++) parts.push({ f: k * hz, a: 0.55 / k, fast: 4 + k * 3 }); bank(out, parts, rate); return out; };

const EXTRA_GENERATORS = {
  flute, clarinet, oboe, violin, cello, trumpet, horn, sax, harp, marimba, vibes, glock, kalimba, musicbox, accordion, harmonica, banjo, steeldrum,
  choir, harpsichord, upright, squarelead, synthpluck, warmpad, glasspad,
};
/** Attack and release (seconds) of the added instruments: bowed and blown sounds swell, struck and plucked ones start at once. */
const EXTRA_SHAPE: Record<keyof typeof EXTRA_GENERATORS, { attack: number; release: number }> = {
  flute: { attack: 0.05, release: 0.12 }, clarinet: { attack: 0.04, release: 0.1 }, oboe: { attack: 0.04, release: 0.1 }, violin: { attack: 0.07, release: 0.18 },
  cello: { attack: 0.09, release: 0.22 }, trumpet: { attack: 0.03, release: 0.09 }, horn: { attack: 0.06, release: 0.14 }, sax: { attack: 0.04, release: 0.1 },
  harp: { attack: 0.003, release: 0.15 }, marimba: { attack: 0.002, release: 0.08 }, vibes: { attack: 0.003, release: 0.3 }, glock: { attack: 0.002, release: 0.2 },
  kalimba: { attack: 0.002, release: 0.15 }, musicbox: { attack: 0.002, release: 0.2 }, accordion: { attack: 0.05, release: 0.08 }, harmonica: { attack: 0.04, release: 0.08 },
  banjo: { attack: 0.002, release: 0.08 }, steeldrum: { attack: 0.003, release: 0.2 }, choir: { attack: 0.3, release: 0.4 }, harpsichord: { attack: 0.002, release: 0.06 },
  upright: { attack: 0.005, release: 0.1 }, squarelead: { attack: 0.01, release: 0.08 }, synthpluck: { attack: 0.002, release: 0.08 }, warmpad: { attack: 0.35, release: 0.45 },
  glasspad: { attack: 0.3, release: 0.5 },
};

const GENERATORS: Record<VoiceName, Gen> = {
  ...EXTRA_GENERATORS,
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
  ...EXTRA_SHAPE,
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

/** Named percussion. Each is a short synthesised hit: swept sines for drums, noise for snares and shakers, clashing squares for metal. */
function drumByKind(kind: DrumKind, i: number, rate: number): number {
  const t = i / rate;
  switch (kind) {
    case 'kick': return drumSample(40, i, rate);
    case 'snare': return drumSample(70, i, rate);
    case 'hat': return drumSample(88, i, rate);
    case 'openhat': return drumSample(92, i, rate) * 0.9 + 0.1 * (noise(i) - noise(i - 1)) * Math.exp(-t * 14);
    case 'clap': return 0.8 * noise(i) * (Math.exp(-t * 40) + 0.7 * Math.exp(-(((t - 0.012) ** 2) * 30000)) + 0.5 * Math.exp(-(((t - 0.024) ** 2) * 30000)) + 0.4 * Math.exp(-t * 14));
    case 'tom': return Math.sin(TAU * (110 * t + 9 * (1 - Math.exp(-t * 14)))) * Math.exp(-t * 7) + 0.1 * noise(i) * Math.exp(-t * 120);
    case 'rim': return (Math.sin(TAU * 1700 * t) * 0.5 + 0.35 * noise(i)) * Math.exp(-t * 130);
    case 'cowbell': return (square(562, t) * 0.4 + square(845, t) * 0.4) * Math.exp(-t * 11);
    case 'shaker': return 0.6 * (noise(i) - noise(i - 1)) * (Math.exp(-t * 28) + 0.5 * Math.exp(-(((t - 0.04) ** 2) * 900)));
    case 'crash': return drumSample(95, i, rate) * 1.2 * Math.exp(-t * 2.2) + 0.25 * (noise(i) - noise(i - 1)) * Math.exp(-t * 2.5);
    default: return 0;
  }
}
export const DRUM_KINDS: DrumKind[] = ['kick', 'snare', 'hat', 'openhat', 'clap', 'tom', 'rim', 'cowbell', 'shaker', 'crash'];
export const isDrumKind = (v: unknown): v is DrumKind => typeof v === 'string' && (DRUM_KINDS as string[]).includes(v);
export const isVoiceName = (v: unknown): v is VoiceName => typeof v === 'string' && Object.prototype.hasOwnProperty.call(GENERATORS, v);

/** The samples of one note: its own attack and release already applied, ready to be added to the mix wherever it plays. */
export function noteWave(note: MusicNote, format: { samples: number; rate: number; preset: SoundPreset; band?: Partial<Band> }): Float32Array {
  const { samples, rate, preset, band } = format;
  const out = new Float32Array(samples);
  const role = note.role ?? 'melody';
  if (role === 'perc') {
    const kind = note.voice;
    if (isDrumKind(kind)) for (let i = 0; i < samples; i++) out[i] = drumByKind(kind, i, rate) * note.gain;
    else for (let i = 0; i < samples; i++) out[i] = drumSample(note.pitch, i, rate) * note.gain;
    return out;
  }
  const hz = 440 * 2 ** ((note.pitch - 69) / 12);
  const name = isVoiceName(note.voice) ? note.voice : band?.[partOf(role)] ?? KIT[preset][partOf(role)];
  const raw = GENERATORS[name](hz, samples, rate);
  const { attack, release } = SHAPE[name];
  for (let i = 0; i < samples; i++) {
    const swell = Math.min(1, i / (rate * attack), (samples - i) / (rate * release));
    out[i] = raw[i] * swell * note.gain;
  }
  return out;
}
