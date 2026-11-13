/**
 * The instruments of the built-in composer. Each one is a small recipe, not a recording: a few partials with their
 * own attack and decay, so a piano note dies away, a plucked string starts bright and mellows, an organ holds, a
 * bell rings with its odd overtones. Drums are a swept sine (kick), noise plus a tone (snare) and high noise (hat).
 * It still sounds synthesised, like an old game or a keyboard demo, not like a recording of real players.
 */
import type { MusicNote, MusicRole, SoundPreset } from './types';

const TAU = 2 * Math.PI;
const NYQUIST_GUARD = 9000; // partials above this are left out so they cannot alias at the lowest sample rate used

type Voice = (t: number, hz: number) => number;
type VoiceName = 'piano' | 'epiano' | 'pluck' | 'organ' | 'bell' | 'saw' | 'pad' | 'bass' | 'sine';

/** Adds the partials of a note, each with its own decay (higher partials fade faster). */
const partials = (hz: number, t: number, ...shape: [amps: number[], decay: (n: number) => number]): number => {
  const [amps, decay] = shape;
  let sum = 0;
  for (let n = 1; n <= amps.length; n++) {
    if (hz * n > NYQUIST_GUARD) break;
    sum += amps[n - 1] * Math.sin(TAU * hz * n * t) * Math.exp(-t * decay(n));
  }
  return sum;
};

const VOICES: Record<VoiceName, Voice> = {
  piano: (t, hz) => partials(hz, t, [1, 0.55, 0.3, 0.16, 0.08], (n) => 1.1 + 1.1 * n),
  // Two-operator FM with a fast-fading modulator: the bright "bark" of an electric piano, then a rounder tone.
  epiano: (t, hz) => (Math.sin(TAU * hz * t + 1.7 * Math.exp(-t * 7) * Math.sin(TAU * hz * t)) + 0.22 * Math.sin(TAU * hz * 2 * t) * Math.exp(-t * 9)) * Math.exp(-t * 1.5),
  pluck: (t, hz) => partials(hz, t, [1, 0.75, 0.5, 0.36, 0.26, 0.18, 0.12], (n) => 1.4 + 1.5 * n) + 0.15 * Math.exp(-t * 90) * Math.sin(TAU * hz * 9.1 * t),
  organ: (t, hz) => partials(hz, t, [1, 0.6, 0.45, 0.3, 0, 0.2], () => 0) + 0.12 * Math.sin(TAU * hz * 1.006 * t),
  bell: (t, hz) => {
    let sum = 0;
    [[1, 1, 1.4], [2.76, 0.5, 2], [5.4, 0.28, 3], [8.93, 0.14, 4.5]].forEach(([ratio, amp, fade]) => {
      if (hz * ratio < NYQUIST_GUARD) sum += amp * Math.sin(TAU * hz * ratio * t) * Math.exp(-t * fade);
    });
    return sum;
  },
  // Band-limited saw as additive partials; the high ones fade, like a filter closing.
  saw: (t, hz) => partials(hz, t, [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12], (n) => 0.25 * (n - 1)) + 0.5 * partials(hz * 1.007, t, [1, 0.5, 0.33, 0.25], (n) => 0.25 * (n - 1)),
  pad: (t, hz) => (Math.sin(TAU * hz * t) + 0.7 * Math.sin(TAU * hz * 1.004 * t) + 0.7 * Math.sin(TAU * hz * 0.996 * t) + 0.15 * Math.sin(TAU * hz * 2 * t)) / 2.2,
  bass: (t, hz) => (Math.sin(TAU * hz * t) + 0.45 * Math.sin(TAU * hz * 2 * t) * Math.exp(-t * 3)) * Math.exp(-t * 1.1),
  sine: (t, hz) => Math.sin(TAU * hz * t),
};

/** Attack and release (seconds) for each voice; pads swell in and out, plucked and struck sounds start at once. */
const SHAPE: Record<VoiceName, { attack: number; release: number }> = {
  piano: { attack: 0.004, release: 0.1 }, epiano: { attack: 0.004, release: 0.12 }, pluck: { attack: 0.003, release: 0.08 },
  organ: { attack: 0.012, release: 0.06 }, bell: { attack: 0.003, release: 0.2 }, saw: { attack: 0.01, release: 0.1 },
  pad: { attack: 0.24, release: 0.33 }, bass: { attack: 0.006, release: 0.08 }, sine: { attack: 0.05, release: 0.2 },
};

type Part = 'melody' | 'pad' | 'bass';
/** Which voice plays each part for each instrument choice. */
const KIT: Record<SoundPreset, Record<Part, VoiceName>> = {
  keys: { melody: 'piano', pad: 'pad', bass: 'bass' },
  epiano: { melody: 'epiano', pad: 'epiano', bass: 'bass' },
  guitar: { melody: 'pluck', pad: 'pluck', bass: 'bass' },
  overdrive: { melody: 'pluck', pad: 'pluck', bass: 'bass' },
  organ: { melody: 'organ', pad: 'organ', bass: 'bass' },
  bell: { melody: 'bell', pad: 'pad', bass: 'bass' },
  synth: { melody: 'saw', pad: 'pad', bass: 'bass' },
  ambient: { melody: 'sine', pad: 'pad', bass: 'sine' },
};

const partOf = (role: MusicRole | undefined): Part => (role === 'pad' || role === 'bass' ? role : 'melody');

/** Same noise every time, so a rendered tune never changes between plays. */
const noise = (i: number): number => (((Math.imul(i, 1103515245) + 12345) >>> 16) & 0x7fff) / 16384 - 1;

/** One percussion hit. A low pitch is a kick, a middle one a snare, a high one a hi-hat. */
function drumSample(pitch: number, i: number, rate: number): number {
  const t = i / rate;
  if (pitch < 60) return Math.sin(TAU * (52 * t + 4.5 * (1 - Math.exp(-t * 28)))) * Math.exp(-t * 9);
  if (pitch < 86) return 0.8 * noise(i) * Math.exp(-t * 17) + 0.5 * Math.sin(TAU * 190 * t) * Math.exp(-t * 24);
  return (noise(i) - noise(i - 1)) * 0.6 * Math.exp(-t * (pitch >= 91 ? 75 : 48));
}

/** The samples of one note: its own attack and release already applied, ready to be added to the mix wherever it plays. */
export function noteWave(note: MusicNote, format: { samples: number; rate: number; preset: SoundPreset }): Float32Array {
  const { samples, rate, preset } = format;
  const out = new Float32Array(samples);
  const role = note.role ?? 'melody';
  if (role === 'perc') {
    for (let i = 0; i < samples; i++) out[i] = drumSample(note.pitch, i, rate) * note.gain;
    return out;
  }
  const hz = 440 * 2 ** ((note.pitch - 69) / 12);
  const name = KIT[preset][partOf(role)];
  const voice = VOICES[name];
  const { attack, release } = SHAPE[name];
  const drive = preset === 'overdrive' && name === 'pluck' ? 3.2 : 0;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const swell = Math.min(1, t / attack, (samples - i) / (rate * release));
    let s = voice(t, hz);
    if (drive) s = Math.tanh(s * drive) / Math.tanh(drive);
    out[i] = s * swell * note.gain;
  }
  return out;
}
