/**
 * Background sounds instead of music: white, pink and brown noise, rain, ocean waves, wind and a fan hum. Each is made from scratch
 * on the phone and its ends are blended, so it loops without a click. Pure (numbers in, samples out), so it is tested without a device.
 */
export type AmbientKind = 'white' | 'pink' | 'brown' | 'rain' | 'ocean' | 'wind' | 'fan';
export const AMBIENT_RATE = 24000;

export const AMBIENT: Array<{ id: AmbientKind; label: string; note: string }> = [
  { id: 'white', label: 'White noise', note: 'Even hiss. Covers voices and traffic.' },
  { id: 'pink', label: 'Pink noise', note: 'Softer hiss, like steady rain on leaves. Popular for sleep.' },
  { id: 'brown', label: 'Brown noise', note: 'Deep rumble, like a distant waterfall or a plane cabin.' },
  { id: 'rain', label: 'Rain', note: 'Steady rain with drops.' },
  { id: 'ocean', label: 'Ocean waves', note: 'Slow surf that swells and fades.' },
  { id: 'wind', label: 'Wind', note: 'Gusts that rise and fall.' },
  { id: 'fan', label: 'Fan hum', note: 'A smooth low hum with a little air.' },
];

function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** One-pole low-pass in place: higher `amount` (0..1) keeps less of the high end. */
function lowPass(x: Float32Array, amount: number): Float32Array {
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += (x[i] - y) * (1 - amount); x[i] = y; }
  return x;
}
/** Removes the slow drift (a one-pole high-pass), so brown noise does not wander off the scale. */
function highPass(x: Float32Array, amount: number): Float32Array {
  let low = 0;
  for (let i = 0; i < x.length; i++) { low += (x[i] - low) * (1 - amount); x[i] -= low; }
  return x;
}

const white = (n: number, r: () => number): Float32Array => Float32Array.from({ length: n }, () => r() * 2 - 1);

/** Paul Kellet's economical pink-noise filter. */
function pink(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return out;
}

function brown(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) { last = (last + 0.02 * (r() * 2 - 1)) / 1.02; out[i] = last * 3.5; }
  return out;
}

/** Slow smooth wobble between 0 and 1 (a sum of a few sines with random phase), for swells and gusts. */
const wobble = (t: number, periods: number[], phases: number[]): number =>
  0.5 + 0.5 * periods.reduce((s, p, k) => s + Math.sin((2 * Math.PI * t) / p + phases[k]) / periods.length, 0);

/** The raw sound before the ends are blended. */
function raw(kind: AmbientKind, n: number, rate: number, r: () => number): Float32Array {
  switch (kind) {
    case 'white': return white(n, r);
    case 'pink': return pink(n, r);
    case 'brown': return highPass(brown(n, r), 0.9995);
    case 'rain': {
      const bed = lowPass(white(n, r), 0.35);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = bed[i] * 0.55;
      // Drops: short, bright ticks at random moments.
      const drops = Math.floor((n / rate) * 55);
      for (let d = 0; d < drops; d++) {
        const at = Math.floor(r() * (n - 400)); const amp = 0.15 + r() * 0.35; const len = 60 + Math.floor(r() * 220);
        for (let k = 0; k < len; k++) out[at + k] += (r() * 2 - 1) * amp * Math.exp((-5 * k) / len);
      }
      return out;
    }
    case 'ocean': {
      const base = lowPass(pink(n, r), 0.6);
      const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
      for (let i = 0; i < n; i++) base[i] *= 0.15 + 0.85 * wobble(i / rate, [9, 13, 5.5], ph) ** 2;
      return base;
    }
    case 'wind': {
      const base = lowPass(white(n, r), 0.93);
      const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
      for (let i = 0; i < n; i++) base[i] *= (0.1 + 0.9 * wobble(i / rate, [11, 7, 17], ph)) * 4;
      return base;
    }
    default: { // fan
      const air = lowPass(white(n, r), 0.7);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / rate; out[i] = 0.5 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 220 * t) + 0.1 * Math.sin(2 * Math.PI * 330 * t) + air[i] * 0.6; }
      return out;
    }
  }
}

/** 16-bit mono samples, `seconds` long, that play round again without a click. */
export function makeAmbient(kind: AmbientKind, seconds: number, o: { seed?: number; rate?: number } = {}): Int16Array {
  const rate = o.rate ?? AMBIENT_RATE;
  const n = Math.max(rate, Math.round(seconds * rate));
  const fade = Math.min(Math.floor(rate * 2), Math.floor(n / 4));
  // Made a little longer; the end is faded out while the extra, laid over the start, fades in, so the join cannot be heard.
  const x = raw(kind, n + fade, rate, rng(o.seed ?? Math.floor(Math.random() * 2 ** 31)));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i];
  for (let i = 0; i < fade; i++) { const w = i / fade; out[i] = out[i] * w + x[n + i] * (1 - w); }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? 0.6 / peak : 0;
  return Int16Array.from(out, (v) => Math.round(v * scale * 32767));
}
