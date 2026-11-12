/**
 * Style presets for the built-in composer: jazz, vaporwave, eerie fog, the seasons and holidays.
 * Each style is plain data (tempo, scale, chords, rhythm), so a new one needs no new code. Every tune is original:
 * no famous melody is used, only the feel (bells for Christmas, a slow waltz for winter, and so on).
 */
import type { MusicNote } from './composition';

export type StyleMood =
  | 'jazz' | 'vaporwave' | 'eerie'
  | 'spring' | 'summer' | 'fall' | 'winter'
  | 'thanksgiving' | 'halloween' | 'christmas' | 'newyear' | 'valentines';

type SoundName = 'keys' | 'bell' | 'synth' | 'ambient';
type Bass = 'root' | 'walk' | 'pulse' | 'drone';
type Perc = 'none' | 'soft' | 'four' | 'swing' | 'sleigh' | 'industrial';
type Tune = 'arp' | 'walk' | 'sparse';

export interface StyleSpec {
  label: string;
  /** The instrument sound that suits the style; the person can still change it. */
  sound: SoundName;
  bpm: number;
  beatsPerBar: 3 | 4;
  /** Semitone steps of the scale. */
  scale: number[];
  /** Chord roots as scale degrees, one per bar, for 8 bars. */
  progression: number[];
  /** Which scale steps above the root sound together: [0, 2, 4] is a plain chord, add 6 for a seventh. */
  chord: number[];
  tune: Tune;
  /** Melody notes per bar (arp and walk) or long notes per bar (sparse). */
  density: number;
  /** 0 to 0.4: how late the off-beat eighths fall. */
  swing: number;
  bass: Bass;
  perc: Perc;
  padGain: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTATONIC = [0, 2, 4, 7, 9, 0, 2];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

const TRIAD = [0, 2, 4];
const SEVENTH = [0, 2, 4, 6];
const NINTH = [0, 2, 4, 6, 8];

export const STYLES: Record<StyleMood, StyleSpec> = {
  jazz: { label: 'Jazz', sound: 'keys', bpm: 120, beatsPerBar: 4, scale: DORIAN, progression: [1, 4, 0, 5, 1, 4, 0, 0], chord: SEVENTH, tune: 'walk', density: 6, swing: 0.34, bass: 'walk', perc: 'swing', padGain: 0.13 },
  vaporwave: { label: 'Vaporwave', sound: 'ambient', bpm: 64, beatsPerBar: 4, scale: MAJOR, progression: [0, 5, 3, 4, 0, 5, 1, 4], chord: NINTH, tune: 'sparse', density: 3, swing: 0, bass: 'root', perc: 'soft', padGain: 0.2 },
  eerie: { label: 'Eerie fog', sound: 'ambient', bpm: 62, beatsPerBar: 4, scale: PHRYGIAN, progression: [0, 1, 0, 5, 0, 1, 4, 1], chord: [0, 1, 3], tune: 'sparse', density: 2, swing: 0, bass: 'drone', perc: 'industrial', padGain: 0.17 },
  spring: { label: 'Spring', sound: 'keys', bpm: 104, beatsPerBar: 4, scale: PENTATONIC, progression: [0, 3, 4, 0, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'pulse', perc: 'soft', padGain: 0.15 },
  summer: { label: 'Summer', sound: 'synth', bpm: 112, beatsPerBar: 4, scale: LYDIAN, progression: [0, 4, 5, 3, 0, 4, 1, 3], chord: SEVENTH, tune: 'walk', density: 8, swing: 0.12, bass: 'pulse', perc: 'four', padGain: 0.16 },
  fall: { label: 'Fall', sound: 'keys', bpm: 76, beatsPerBar: 4, scale: DORIAN, progression: [0, 5, 3, 4, 0, 5, 1, 4], chord: SEVENTH, tune: 'arp', density: 8, swing: 0, bass: 'root', perc: 'none', padGain: 0.2 },
  winter: { label: 'Winter', sound: 'bell', bpm: 72, beatsPerBar: 3, scale: MAJOR, progression: [0, 5, 3, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 6, swing: 0, bass: 'root', perc: 'none', padGain: 0.14 },
  thanksgiving: { label: 'Thanksgiving', sound: 'keys', bpm: 84, beatsPerBar: 4, scale: MAJOR, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'root', perc: 'none', padGain: 0.18 },
  halloween: { label: 'Halloween', sound: 'bell', bpm: 96, beatsPerBar: 4, scale: HARMONIC_MINOR, progression: [0, 0, 5, 4, 0, 0, 5, 4], chord: TRIAD, tune: 'walk', density: 4, swing: 0.1, bass: 'pulse', perc: 'industrial', padGain: 0.16 },
  christmas: { label: 'Christmas', sound: 'bell', bpm: 100, beatsPerBar: 4, scale: MAJOR, progression: [0, 3, 0, 4, 0, 5, 3, 0], chord: TRIAD, tune: 'walk', density: 4, swing: 0, bass: 'root', perc: 'sleigh', padGain: 0.14 },
  newyear: { label: 'New Year', sound: 'synth', bpm: 124, beatsPerBar: 4, scale: MAJOR, progression: [0, 4, 5, 3, 0, 4, 5, 3], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.16 },
  valentines: { label: 'Valentine', sound: 'keys', bpm: 66, beatsPerBar: 3, scale: MINOR, progression: [0, 5, 3, 4, 0, 5, 1, 4], chord: SEVENTH, tune: 'walk', density: 3, swing: 0, bass: 'root', perc: 'none', padGain: 0.18 },
};

export const isStyleMood = (mood: string): mood is StyleMood => mood in STYLES;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The pitch of a scale step, counting past the top of the scale into the next octave. */
const stepPitch = (spec: StyleSpec, tonic: number, step: number) => tonic + spec.scale[((step % 7) + 7) % 7] + 12 * Math.floor(step / 7);

/** Beat position of the nth equal slice of a bar, with the off-beat slices held back by the swing amount. */
function slot(spec: StyleSpec, at: { bar: number; n: number; slices: number }): number {
  const { bar, n, slices } = at;
  const width = spec.beatsPerBar / slices;
  const late = n % 2 === 1 ? spec.swing * width : 0;
  return bar * spec.beatsPerBar + n * width + late;
}

function chordNotes(spec: StyleSpec, tonic: number, bar: number): MusicNote[] {
  const degree = spec.progression[bar];
  return spec.chord.map((offset) => ({ pitch: stepPitch(spec, tonic, degree + offset) + 12, beat: bar * spec.beatsPerBar, length: spec.beatsPerBar - 0.05, gain: spec.padGain, role: 'pad' as const }));
}

function bassNotes(spec: StyleSpec, tonic: number, bar: number): MusicNote[] {
  const degree = spec.progression[bar];
  const base = bar * spec.beatsPerBar;
  const root = stepPitch(spec, tonic, degree) - 12;
  if (spec.bass === 'drone') return [{ pitch: tonic - 12, beat: base, length: spec.beatsPerBar - 0.05, gain: 0.3, role: 'bass' }];
  if (spec.bass === 'root') return [{ pitch: root, beat: base, length: spec.beatsPerBar - 0.35, gain: 0.25, role: 'bass' }];
  const walk = [0, 2, 4, 5].map((step) => stepPitch(spec, tonic, degree + step) - 12);
  return Array.from({ length: spec.beatsPerBar }, (_, beat) => ({
    pitch: spec.bass === 'walk' ? walk[beat % 4] : root + (beat % 2 ? 7 : 0),
    beat: base + beat, length: 0.9, gain: 0.24, role: 'bass' as const,
  }));
}

function tuneNotes(spec: StyleSpec, key: { tonic: number; seed: number }, bar: number): MusicNote[] {
  const { tonic, seed } = key;
  const degree = spec.progression[bar];
  const out: MusicNote[] = [];
  const top = tonic + 24;
  for (let n = 0; n < spec.density; n++) {
    const beat = spec.tune === 'sparse'
      ? bar * spec.beatsPerBar + (n * spec.beatsPerBar) / spec.density
      : slot(spec, { bar, n, slices: spec.density });
    // Rests: some bars leave a gap, decided by the seed, so the tune breathes.
    if ((seed >>> ((bar + n) % 24)) % 5 === 0 && spec.tune !== 'arp') continue;
    let step: number;
    if (spec.tune === 'arp') step = degree + spec.chord[[0, 2, 1, 2][n % 4] % spec.chord.length];
    else step = degree + ((seed >>> ((bar * 3 + n) % 28)) % 5) + (n % 2);
    const length = spec.tune === 'sparse' ? (spec.beatsPerBar / spec.density) * 0.9 : (spec.beatsPerBar / spec.density) * 0.85;
    out.push({ pitch: Math.min(90, stepPitch(spec, top, step)), beat, length, gain: n === 0 ? 0.26 : 0.18, role: 'melody' });
  }
  return out;
}

function percNotes(spec: StyleSpec, bar: number, seed: number): MusicNote[] {
  const base = bar * spec.beatsPerBar;
  const hit = (beat: number, pitch: number, gain: number): MusicNote => ({ pitch, beat, length: 0.25, gain, role: 'perc' });
  switch (spec.perc) {
    case 'four': return Array.from({ length: spec.beatsPerBar * 2 }, (_, n) => (n % 2 === 0 ? hit(base + n / 2, 40, 0.5) : hit(base + n / 2, 90, 0.12)));
    case 'soft': return [hit(base, 40, 0.3), hit(base + spec.beatsPerBar / 2, 90, 0.1)];
    case 'swing': return Array.from({ length: spec.beatsPerBar * 2 }, (_, n) => hit(slot(spec, { bar, n, slices: spec.beatsPerBar * 2 }), 91, n % 2 ? 0.07 : 0.11));
    case 'sleigh': return Array.from({ length: spec.beatsPerBar }, (_, n) => hit(base + n, 91, n === 0 ? 0.16 : 0.1));
    case 'industrial': return [0, 1, 2, 3].filter((n) => (seed >>> ((bar * 4 + n) % 30)) % 3 === 0).map((n) => hit(base + n + 0.5, n % 2 ? 80 : 44, 0.22));
    default: return [];
  }
}

/** A seeded 8-bar tune in one of the styles above. The same prompt always makes the same tune. */
export function composeStyled(prompt: string, mood: StyleMood): { title: string; bpm: number; notes: MusicNote[] } {
  const spec = STYLES[mood];
  const seed = hash(`${mood}:${prompt.toLowerCase().trim()}`);
  const tonic = 48 + (seed % 5);
  const notes: MusicNote[] = [];
  for (let bar = 0; bar < 8; bar++) {
    notes.push(...chordNotes(spec, tonic, bar), ...bassNotes(spec, tonic, bar), ...tuneNotes(spec, { tonic, seed }, bar), ...percNotes(spec, bar, seed));
  }
  const label = prompt.trim().replace(/[\r\n]+/g, ' ').slice(0, 56) || spec.label;
  return { title: `${label} (${spec.label})`, bpm: spec.bpm, notes };
}
