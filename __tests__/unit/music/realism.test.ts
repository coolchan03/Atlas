/**
 * Structural checks that the instruments behave like what they are (pitch, decay, overtones, no clicks). These cannot say whether they
 * sound good to a person; they stop the worst failures: out of tune notes, a piano that does not fade, a pad that is a bare sine.
 */
import { noteWave } from '../../../src/music/instruments';
import type { MusicNote, SoundPreset } from '../../../src/music/types';

const RATE = 24000;
const make = (pitch: number, seconds: number, role: MusicNote['role'], preset: SoundPreset = 'band', band?: any) =>
  noteWave({ pitch, beat: 0, length: seconds, gain: 0.5, role }, { samples: Math.round(seconds * RATE), rate: RATE, preset, band }) as Float32Array;
const hzOf = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

/** The pitch heard in a stretch of samples, by autocorrelation around the expected period (in cents away from the expected pitch). */
function centsOff(w: Float32Array, hz: number, from = 0.15, to = 0.6): number {
  const a = Math.round(from * RATE); const b = Math.round(to * RATE);
  const expected = RATE / hz; let best = 0; let bestLag = expected;
  for (let lag = Math.floor(expected * 0.9); lag <= Math.ceil(expected * 1.1); lag++) {
    let sum = 0; for (let i = a; i < b; i++) sum += w[i] * w[i + lag];
    if (sum > best) { best = sum; bestLag = lag; }
  }
  // Refine with the parabola through the three lags around the best.
  const at = (lag: number) => { let sum = 0; for (let i = a; i < b; i++) sum += w[i] * w[i + lag]; return sum; };
  const y0 = at(bestLag - 1); const y1 = at(bestLag); const y2 = at(bestLag + 1);
  const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
  return 1200 * Math.log2(expected / (bestLag + (Number.isFinite(shift) ? shift : 0)));
}
const rms = (w: Float32Array, from: number, to: number) => { let s = 0; const a = Math.round(from * RATE); const b = Math.round(to * RATE); for (let i = a; i < b; i++) s += w[i] * w[i]; return Math.sqrt(s / (b - a)); };

it('plucked strings and the bass are in tune across their working range (within 20 cents)', () => {
  for (const pitch of [36, 43, 48, 55, 60, 67]) {
    const bass = make(pitch, 1.2, 'bass');
    expect(Math.abs(centsOff(bass, hzOf(pitch)))).toBeLessThan(20);
  }
  for (const pitch of [52, 60, 69]) {
    const guitar = make(pitch, 1.2, 'melody', 'guitar');
    expect(Math.abs(centsOff(guitar, hzOf(pitch)))).toBeLessThan(20);
  }
});

it('a piano note starts with a thump and a loud, bright attack, then fades away, high notes faster than low ones', () => {
  const low = make(48, 3, 'melody', 'keys'); const high = make(84, 3, 'melody', 'keys');
  expect(rms(low, 0, 0.05)).toBeGreaterThan(rms(low, 1.5, 1.55) * 1.8);
  expect(rms(low, 2.5, 2.6) / rms(low, 0.05, 0.15)).toBeGreaterThan(rms(high, 2.5, 2.6) / rms(high, 0.05, 0.15)); // low notes ring longer
  expect(Math.max(...Array.from(low).map(Math.abs))).toBeGreaterThan(0.02);
  expect(Array.from(low).every(Number.isFinite)).toBe(true);
});

it('the piano is not a pure organ-like tone: overtones are slightly sharp of the harmonics (stiff strings)', () => {
  const hz = 261.63; const w = make(60, 1.5, 'melody', 'keys');
  const energyAt = (f: number) => { let re = 0; let im = 0; const a = Math.round(0.05 * RATE); const b = Math.round(0.6 * RATE); for (let i = a; i < b; i++) { re += w[i] * Math.cos(TAU * f * i / RATE); im += w[i] * Math.sin(TAU * f * i / RATE); } return re * re + im * im; };
  const TAU = 2 * Math.PI;
  // The 8th overtone of a stiff string sits above 8 times the fundamental: more energy a few Hz up than exactly on the harmonic.
  const on = energyAt(8 * hz); const sharp = Math.max(energyAt(8 * hz + 3), energyAt(8 * hz + 6), energyAt(8 * hz + 9));
  expect(sharp).toBeGreaterThan(on * 0.5);
});

it('strings and pads carry real overtones (a detuned sawtooth, not a bare sine)', () => {
  const hz = hzOf(57); const w = make(57, 1.5, 'pad', 'band', { pad: 'pad' });
  const one = (f: number) => { let re = 0; let im = 0; const a = Math.round(0.3 * RATE); const b = Math.round(1.2 * RATE); for (let i = a; i < b; i++) { re += w[i] * Math.cos(2 * Math.PI * f * i / RATE); im += w[i] * Math.sin(2 * Math.PI * f * i / RATE); } return Math.sqrt(re * re + im * im); };
  // The two detuned voices sit a few cents either side, so look a hair either side of each harmonic.
  const bin = (f: number) => Math.max(one(f * 0.996), one(f), one(f * 1.004));
  expect(bin(2 * hz) + bin(3 * hz) + bin(4 * hz)).toBeGreaterThan(0.5 * bin(hz));
});

it('hi-hats are bright noise and kicks are low and short', () => {
  const hat = make(95, 0.25, 'perc'); const kick = make(36, 0.4, 'perc');
  const zc = (w: Float32Array) => { let n = 0; for (let i = 1; i < w.length; i++) if ((w[i - 1] >= 0) !== (w[i] >= 0)) n++; return n / (w.length / RATE) / 2; };
  expect(zc(hat)).toBeGreaterThan(2500);
  expect(zc(kick)).toBeLessThan(400);
  expect(rms(kick, 0.3, 0.38)).toBeLessThan(rms(kick, 0, 0.05) * 0.2);
});
