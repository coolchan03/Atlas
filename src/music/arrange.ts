/**
 * Writes a 16-bar tune from a style: an A section and a B section, chords played the way the style plays them, a bass line,
 * a melody built from a short motif that is repeated, moved up a step, turned over and then resolved, and drums with a fill at
 * the end of each section. Seeded, so the same prompt always gives the same tune. Everything is original; no known melody is used.
 */
import type { Comp, StyleSpec } from './styleTypes';
import type { MusicNote } from './types';

export const BARS = 16;
const A_BARS = 8;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const seedFor = (prompt: string, mood: string): number => hash(`${mood}:${prompt.toLowerCase().trim()}`);

interface Key { spec: StyleSpec; tonic: number; seed: number }

/** The pitch of a scale step, counting past the top of the scale into the next octave. */
const stepPitch = (spec: StyleSpec, base: number, step: number) => base + spec.scale[((step % 7) + 7) % 7] + 12 * Math.floor(step / 7);

/** The chord root, as a scale degree, for a bar of the 16: the A section, then the B section. */
function degreeAt(spec: StyleSpec, bar: number): number {
  const a = spec.progression;
  const rotated = [...a.slice(4), ...a.slice(0, 4)];
  // The B section: the one the style gives, else the A chords in the other order, else IV V vi V IV V I I when that would be the same.
  const b = spec.progressionB ?? (rotated.join() !== a.join() ? rotated : [3, 4, 5, 4, 3, 4, 0, 0]);
  return (bar < A_BARS ? a : b)[bar % A_BARS] ?? 0;
}

/** Beat of the nth slice of a bar, with the off-beat slices held back by the swing amount. */
function slot(spec: StyleSpec, at: { bar: number; n: number; slices: number }): number {
  const { bar, n, slices } = at;
  const width = spec.beatsPerBar / slices;
  return bar * spec.beatsPerBar + n * width + (n % 2 === 1 ? spec.swing * width : 0);
}

// eslint-disable-next-line max-params -- a note is five plain numbers and a role; an object here would only add noise to every call
const note = (pitch: number, beat: number, length: number, gain: number, role: MusicNote['role']): MusicNote => ({ pitch: Math.min(90, pitch), beat, length, gain, role });
/** The B section is a little louder, and the first beat of each bar a little stronger. */
const lift = (bar: number) => (bar >= A_BARS ? 1.12 : 1);

// ---------------------------------------------------------------- chords
const defaultComp = (spec: StyleSpec): Comp => (spec.beatsPerBar === 3 ? 'oompah' : spec.beatsPerBar === 6 ? 'jig' : 'sustain');

function chordNotes({ spec, tonic }: Key, bar: number): MusicNote[] {
  const degree = degreeAt(spec, bar);
  const base = bar * spec.beatsPerBar;
  const tones = spec.chord.map((offset) => stepPitch(spec, tonic, degree + offset) + 12);
  const g = spec.padGain * lift(bar);
  const hit = (beats: number[], length: number, gain = g) => beats.flatMap((b) => tones.map((p) => note(p, base + b, length, gain, 'pad')));
  const n = spec.beatsPerBar;
  switch (spec.comp ?? defaultComp(spec)) {
    case 'offbeat': return hit(Array.from({ length: n }, (_, i) => i + 0.5), 0.4);
    case 'stabs': return hit(n === 4 ? [0, 1.5, 2.5] : [0, 1.5], 0.35, g * 1.1);
    case 'eighths': return Array.from({ length: n * 2 }, (_, i) => note(i % 2 ? tones[1] ?? tones[0] : tones[0], base + i / 2, 0.45, g * (i % 2 ? 0.85 : 1), 'pad'));
    case 'arp': return Array.from({ length: n * 2 }, (_, i) => note(tones[[0, 1, 2, 1][i % 4] % tones.length], base + i / 2, 0.5, g * 1.1, 'pad'));
    case 'alberti': return Array.from({ length: n * 2 }, (_, i) => note(tones[[0, 2, 1, 2][i % 4] % tones.length] - 12, base + i / 2, 0.5, g, 'pad'));
    case 'oompah': return hit(n === 3 ? [1, 2] : [1, 3], 0.7);
    case 'jig': return hit([0, 3], 2.6);
    case 'swingcomp': return hit(n === 4 ? [0, 1.5 + spec.swing * 0.5, 2.5] : [0, 1.5], 0.9);
    case 'strum': return hit(Array.from({ length: n }, (_, i) => i), 0.9, g);
    case 'bossa': return hit(n === 4 ? [0, 1.5, 3] : [0, 1.5], 0.45);
    default: return hit([0], n - 0.05);
  }
}

// ---------------------------------------------------------------- bass
function bassNotes({ spec, tonic }: Key, bar: number): MusicNote[] {
  const degree = degreeAt(spec, bar);
  const next = degreeAt(spec, (bar + 1) % BARS);
  const base = bar * spec.beatsPerBar;
  const n = spec.beatsPerBar;
  const root = stepPitch(spec, tonic, degree) - 12;
  const g = 0.25 * lift(bar);
  if (spec.bass === 'drone') return [note(tonic - 12, base, n - 0.05, 0.3, 'bass')];
  if (spec.bass === 'root') return [note(root, base, n / 2 - 0.1, g, 'bass'), note(root + 7, base + n / 2 + 0.5, n / 2 - 0.6, g * 0.8, 'bass')];
  if (spec.bass === 'walk') {
    const line = [0, 2, 4].map((step) => stepPitch(spec, tonic, degree + step) - 12);
    const approach = stepPitch(spec, tonic, next) - 12 + (stepPitch(spec, tonic, next) > stepPitch(spec, tonic, degree) ? -1 : 1);
    return Array.from({ length: n }, (_, i) => note(i === n - 1 ? approach : line[i % 3], base + i, 0.9, g, 'bass'));
  }
  // 'pulse': root on the beat, the fifth or octave in between.
  return Array.from({ length: n }, (_, i) => note(root + (i % 2 ? 7 : 0), base + i, 0.9, g * (i === 0 ? 1.1 : 1), 'bass'));
}

// ---------------------------------------------------------------- melody
const MOTIFS = [[0, 1, 2, 1], [0, 2, 1, 3], [2, 1, 0, 1], [0, 0, 2, 1], [0, 3, 2, 0], [1, 0, 1, 2], [0, 2, 4, 2], [2, 3, 2, 0]];
const motifFor = (seed: number): number[] => MOTIFS[seed % MOTIFS.length];

/** The pitch classes (0 to 11) of the chord in a bar, for checking that a melody agrees with its chord. */
export function chordPitchClasses(spec: StyleSpec, seed: number, bar: number): number[] {
  const tonic = 48 + (seed % 5);
  return spec.chord.map((offset) => stepPitch(spec, tonic, degreeAt(spec, bar) + offset) % 12);
}

/** One bar of the phrase: the motif, then the motif a step higher, then turned over, then a resolution on the chord's root. */
function phraseOffsets(motif: number[], phraseBar: number, length: number): number[] {
  const base = Array.from({ length }, (_, i) => motif[i % motif.length]);
  if (phraseBar === 1) return base.map((o) => o + 1);
  if (phraseBar === 2) return base.map((o) => -o);
  if (phraseBar === 3) return [...base.slice(0, Math.max(0, length - 1)), 0];
  return base;
}

function tuneNotes({ spec, tonic, seed }: Key, bar: number): MusicNote[] {
  const degree = degreeAt(spec, bar);
  const top = tonic + 24;
  const phraseBar = bar % 4;
  const motif = motifFor(seed + (bar >= A_BARS ? 3 : 0));
  const g = 0.2 * lift(bar);
  const out: MusicNote[] = [];
  if (spec.tune === 'arp') {
    const pattern = [[0, 1, 2, 1], [2, 1, 0, 1], [0, 2, 1, 2], [0, 1, 2, 0]][phraseBar];
    for (let i = 0; i < spec.density; i++) {
      const last = phraseBar === 3 && i === spec.density - 1;
      const tone = last ? 0 : spec.chord[pattern[i % pattern.length] % spec.chord.length];
      out.push(note(stepPitch(spec, top, degree + tone), slot(spec, { bar, n: i, slices: spec.density }), (spec.beatsPerBar / spec.density) * (last ? 1.6 : 0.85), g * (i === 0 ? 1.2 : 0.9), 'melody'));
    }
    return out;
  }
  const offsets = phraseOffsets(motif, phraseBar, spec.density);
  for (let i = 0; i < spec.density; i++) {
    const strong = i === 0;
    // Passing notes may be any scale step; the first note of a bar is always a chord tone so the melody agrees with the chord.
    const offset = strong ? spec.chord[Math.abs(offsets[0]) % spec.chord.length] : offsets[i];
    const beat = spec.tune === 'sparse' ? bar * spec.beatsPerBar + (i * spec.beatsPerBar) / spec.density : slot(spec, { bar, n: i, slices: spec.density });
    const finalNote = phraseBar === 3 && i === spec.density - 1;
    const width = spec.beatsPerBar / spec.density;
    // A sparse tune leaves a rest in the middle of a phrase, in the same place every time it comes round.
    if (spec.tune === 'sparse' && phraseBar === 1 && i === spec.density - 1) continue;
    out.push(note(stepPitch(spec, top, degree + offset), beat, finalNote ? width * 1.8 : width * (spec.tune === 'sparse' ? 0.9 : 0.85), g * (strong ? 1.25 : 0.9), 'melody'));
  }
  return out;
}

// ---------------------------------------------------------------- drums
function drumNotes({ spec, seed }: Key, bar: number): MusicNote[] {
  if (spec.perc === 'none') return [];
  const base = bar * spec.beatsPerBar;
  const n = spec.beatsPerBar;
  const hit = (beat: number, pitch: number, gain: number): MusicNote => ({ pitch, beat, length: 0.25, gain, role: 'perc' });
  const fill = bar % 8 === 7 && spec.perc !== 'industrial' && spec.perc !== 'sleigh'
    ? [0, 0.25, 0.5, 0.75].map((d, i) => hit(base + n - 1 + d, i % 2 ? 82 : 76, 0.3 + i * 0.05)) : [];
  let pattern: MusicNote[];
  switch (spec.perc) {
    case 'four': pattern = Array.from({ length: n * 2 }, (_, i) => (i % 2 === 0 ? hit(base + i / 2, 40, 0.5) : hit(base + i / 2, 90, 0.12))); break;
    case 'backbeat': pattern = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? hit(base + i, 40, 0.5) : hit(base + i, 82, 0.3))).concat(Array.from({ length: n }, (_, i) => hit(base + i + 0.5, 91, 0.1))); break;
    case 'offbeat': pattern = Array.from({ length: n }, (_, i) => hit(base + i + 0.5, 90, 0.16)).concat([hit(base, 40, 0.4)]); break;
    case 'soft': pattern = [hit(base, 40, 0.3), hit(base + n / 2, 90, 0.1)]; break;
    case 'swing': pattern = Array.from({ length: n * 2 }, (_, i) => hit(slot(spec, { bar, n: i, slices: n * 2 }), 91, i % 2 ? 0.07 : 0.11)); break;
    case 'sleigh': pattern = Array.from({ length: n }, (_, i) => hit(base + i, 91, i === 0 ? 0.16 : 0.1)); break;
    case 'industrial': pattern = [0, 1, 2, 3].filter((i) => (seed >>> ((bar * 4 + i) % 30)) % 3 === 0).map((i) => hit(base + i + 0.5, i % 2 ? 80 : 44, 0.22)); break;
    default: pattern = [];
  }
  // A fill replaces whatever would fall on the last beat of the section.
  return fill.length ? [...pattern.filter((p) => p.beat < base + n - 1), ...fill] : pattern;
}

/** The whole tune: 16 bars of chords, bass, melody and drums. */
export function composeFromSpec(spec: StyleSpec, seed: number): MusicNote[] {
  const key: Key = { spec, tonic: 48 + (seed % 5), seed };
  const notes: MusicNote[] = [];
  for (let bar = 0; bar < BARS; bar++) notes.push(...chordNotes(key, bar), ...bassNotes(key, bar), ...tuneNotes(key, bar), ...drumNotes(key, bar));
  return notes;
}
