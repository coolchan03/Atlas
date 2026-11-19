/**
 * Music theory the composer does not have to guess. A small model writing notes from nothing drifts out of key, lands on clashing notes
 * and loses the beat. So the key, the scale and the chord of every bar are worked out here in code and handed to the model as a plan,
 * and what it writes is then corrected against the same plan:
 *   - notes outside the key are moved to the nearest note of the scale (the blues and modal scales a style uses are respected);
 *   - the melody lands on a chord tone on the strong beats (the first and third of a bar of four);
 *   - the bass plays the root of the chord on the first beat of every bar;
 *   - timings are put on a quarter-beat grid, so nothing is off the beat by accident;
 *   - each part is moved by octaves into the range it is written for.
 * Pure and deterministic, so it is tested without a phone.
 */
import type { StyleSpec } from './styleTypes';
import type { MusicNote, MusicScore } from './types';

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Tonics that sit well for a small ensemble, and whether they are spelled with flats. */
const KEYS: Array<{ pc: number; flats: boolean }> = [{ pc: 0, flats: false }, { pc: 2, flats: false }, { pc: 5, flats: true }, { pc: 7, flats: false }, { pc: 9, flats: false }, { pc: 10, flats: true }, { pc: 3, flats: true }];

interface BarPlan { bar: number; degree: number; root: number; /** Pitch classes of the chord, root first. */ tones: number[]; name: string }
export interface HarmonyPlan { tonic: number; flats: boolean; scale: number[]; scaleName: string; bars: BarPlan[]; beatsPerBar: number }

const SCALE_NAMES: Array<[string, number[]]> = [
  ['major', [0, 2, 4, 5, 7, 9, 11]], ['Dorian', [0, 2, 3, 5, 7, 9, 10]], ['natural minor', [0, 2, 3, 5, 7, 8, 10]], ['Phrygian', [0, 1, 3, 5, 7, 8, 10]],
  ['harmonic minor', [0, 2, 3, 5, 7, 8, 11]], ['Lydian', [0, 2, 4, 6, 7, 9, 11]], ['Mixolydian', [0, 2, 4, 5, 7, 9, 10]], ['Phrygian dominant', [0, 1, 4, 5, 7, 8, 10]],
];
const nameOf = (scale: number[]): string => SCALE_NAMES.find(([, s]) => s.join() === scale.join())?.[0] ?? 'the scale of the style';
const pcName = (pc: number, flats: boolean): string => (flats ? FLAT : SHARP)[((pc % 12) + 12) % 12];
const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** "Dm7", "G", "Bdim": the chord's name from the notes it is made of. */
function chordName(root: number, tones: number[], flats: boolean): string {
  const iv = new Set(tones.map((t) => mod12(t - root)));
  const third = iv.has(4) ? 'maj' : iv.has(3) ? 'min' : '';
  const fifth = iv.has(7) ? 'p' : iv.has(6) ? 'dim' : iv.has(8) ? 'aug' : 'p';
  const seventh = iv.has(11) ? 'maj7' : iv.has(10) ? '7' : '';
  const base = pcName(root, flats);
  if (third === 'min') return `${base}${fifth === 'dim' ? 'dim' : 'm'}${seventh === 'maj7' ? 'maj7' : seventh}`;
  if (third === 'maj') return `${base}${fifth === 'aug' ? 'aug' : ''}${seventh === 'maj7' ? 'maj7' : seventh}`;
  return `${base}${seventh}`;
}

/** The key, the scale and the chord of each bar for a style. The key is chosen from the request so the same request keeps its key. */
export function harmonyPlan(spec: StyleSpec, bars: number, seed: number): HarmonyPlan {
  const key = KEYS[Math.abs(seed) % KEYS.length];
  const scale = spec.scale.map((s) => mod12(s));
  const prog = spec.progression.length ? spec.progression : [0, 4, 5, 3];
  const b = spec.progressionB ?? [...prog.slice(4), ...prog.slice(0, 4)];
  const plan: BarPlan[] = Array.from({ length: bars }, (_, bar) => {
    const section = Math.floor(bar / 8) % 2 === 0 ? prog : b;
    const degree = section[bar % 8 % section.length] ?? 0;
    const root = mod12(key.pc + scale[((degree % 7) + 7) % 7]);
    const tones = spec.chord.map((off) => mod12(key.pc + scale[(((degree + off) % 7) + 7) % 7]));
    return { bar, degree, root, tones: [root, ...tones.filter((t) => t !== root)], name: chordName(root, tones, key.flats) };
  });
  return { tonic: key.pc, flats: key.flats, scale: scale.map((s) => mod12(key.pc + s)), scaleName: nameOf(spec.scale), bars: plan, beatsPerBar: spec.beatsPerBar };
}

/** The plan in words, for the composer's brief: key, scale notes and a chord for every bar with its notes. */
export function planText(plan: HarmonyPlan): string {
  const names = (pcs: number[]) => pcs.map((p) => pcName(p, plan.flats)).join(' ');
  const lines = plan.bars.map((b) => `Bar ${b.bar + 1}: ${b.name} (${names(b.tones)}); bass root ${pcName(b.root, plan.flats)}`);
  return `KEY: ${pcName(plan.tonic, plan.flats)} ${plan.scaleName}. Scale notes: ${names([...plan.scale].sort((a, c) => mod12(a - plan.tonic) - mod12(c - plan.tonic)))}. Bars have ${plan.beatsPerBar} beats.\nCHORDS (use exactly these, one bar each):\n${lines.join('\n')}`;
}

/** The theory every tune is held to, written for the model to follow. */
export const THEORY_PRIMER = `MUSIC THEORY TO FOLLOW
- Stay in the scale you are given. Every note of the melody is a scale note.
- On the strong beats (the first and third beat of a bar of four) the melody lands on a note of that bar's chord. Passing notes between them move by step.
- The melody mostly moves by step (one scale note up or down). After a leap of a third or more, turn back the other way by step.
- Make a short motif of 3 to 5 notes in bar 1, repeat it in bar 2 changed a little (a step higher or lower), then answer it in bars 3 and 4. Phrases are 2 or 4 bars long and end on a chord tone, with a long note.
- Shape it: the melody rises toward the middle and settles at the end. The last bar ends on the root of the key.
- The bass plays the root of the chord on the first beat of every bar, and may add the fifth. Keep the bass low, the chords in the middle, the melody on top, and do not play two parts on the same pitch.
- Chords: play the notes given for the bar together, once or in a pattern that suits the style. Keep the same chord for the whole bar.
- Rhythm: put notes on the beat or on half beats, and vary long and short notes. Rest now and then; silence is part of the music.
- Build: start with fewer instruments, add one every 4 bars, and thin out in the last 2 bars. Louder where it is fuller, softer at the start and end.`;

// ------------------------------------------------------------------ correcting a written score
const RANGE: Record<'melody' | 'pad' | 'bass', [number, number]> = { melody: [57, 91], pad: [48, 84], bass: [28, 60] };
const roleOf = (n: MusicNote): 'melody' | 'pad' | 'bass' => (n.role === 'bass' ? 'bass' : n.role === 'pad' ? 'pad' : 'melody');

/** The pitch nearest to `pitch` whose pitch class is in `allowed` (ties go down). */
function nearest(pitch: number, allowed: number[]): number {
  let best = pitch; let gap = 99;
  for (let d = 0; d <= 6; d++) {
    for (const dir of [-1, 1]) {
      const p = pitch + dir * d;
      if (allowed.includes(mod12(p)) && d < gap) { best = p; gap = d; }
    }
    if (gap === d) break;
  }
  return best;
}

/** Moves a pitch by octaves into a range, keeping its pitch class. */
function intoRange(pitch: number, [lo, hi]: [number, number]): number {
  let p = pitch;
  while (p < lo) p += 12;
  while (p > hi) p -= 12;
  return p;
}

export interface Conformed { score: MusicScore; changed: { outOfKey: number; strongBeats: number; bassRoots: number; grid: number; range: number } }

/** Corrects a written score against the plan (see the top of this file). Returns a new score; the original is not changed. */
export function conformScore(score: MusicScore, plan: HarmonyPlan): Conformed {
  const changed = { outOfKey: 0, strongBeats: 0, bassRoots: 0, grid: 0, range: 0 };
  const barOf = (beat: number) => plan.bars[Math.min(plan.bars.length - 1, Math.max(0, Math.floor(beat / plan.beatsPerBar + 1e-6)))];
  const strong = (beat: number) => { const x = ((beat % plan.beatsPerBar) + plan.beatsPerBar) % plan.beatsPerBar; return x < 0.001 || (plan.beatsPerBar === 4 && Math.abs(x - 2) < 0.001); };
  const notes = score.notes.map((n): MusicNote => {
    if (n.role === 'perc') return n;
    let { pitch, beat, length } = n;
    const role = roleOf(n);
    const q = (x: number) => Math.round(x * 4) / 4;
    if (Math.abs(q(beat) - beat) > 1e-6 || Math.abs(q(length) - length) > 1e-6) { changed.grid += 1; beat = q(beat); length = Math.max(0.25, q(length)); }
    const bar = barOf(beat);
    if (role === 'bass') {
      if (Math.abs(beat - bar.bar * plan.beatsPerBar) < 0.001 && mod12(pitch) !== bar.root) { pitch = nearest(pitch, [bar.root]); changed.bassRoots += 1; }
      else if (!plan.scale.includes(mod12(pitch)) && !bar.tones.includes(mod12(pitch))) { pitch = nearest(pitch, bar.tones); changed.outOfKey += 1; }
    } else if (role === 'melody') {
      if (strong(beat) && !bar.tones.includes(mod12(pitch))) { pitch = nearest(pitch, bar.tones); changed.strongBeats += 1; }
      else if (!plan.scale.includes(mod12(pitch))) { pitch = nearest(pitch, plan.scale); changed.outOfKey += 1; }
    } else if (!bar.tones.includes(mod12(pitch)) && !plan.scale.includes(mod12(pitch))) { pitch = nearest(pitch, bar.tones); changed.outOfKey += 1; }
    const ranged = intoRange(pitch, RANGE[role]);
    if (ranged !== pitch) { changed.range += 1; pitch = ranged; }
    return { ...n, pitch, beat, length };
  });
  return { score: { ...score, notes }, changed };
}
