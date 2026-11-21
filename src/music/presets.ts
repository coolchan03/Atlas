/**
 * Starting points for making your own music in the note editor: an empty page, a drum beat, or a chord loop to play a melody over.
 * Each builds a plain score (chords, a bass line and drums; the melody is left for the person) that the editor opens, so everything the
 * editor does works on it. Pure.
 */
import type { DrumKind, MusicNote, MusicScore, Voice } from './types';

export interface TunePreset { id: string; label: string; hint: string; build: () => MusicScore }

type Band = NonNullable<MusicScore['band']>;
const CHORDS = {
  major: [0, 4, 7], minor: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
} as const;
type Quality = keyof typeof CHORDS;
/** MIDI note number of a root: C3 = 48. */
const root = (name: string): number => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<string, number>)[name[0]] + (name.includes('#') ? 1 : 0) - (name.includes('b') ? 1 : 0) + 48;

interface Bar { root: string; quality: Quality }

/** Keeps the bass inside the bass instruments' range (they start at E2) and the chords inside a pad's comfortable top (C5 and below, one octave of headroom). */
const bassPitch = (p: number): number => (p < 40 ? p + 12 : p);
const padPitch = (p: number): number => (p > 72 ? p - 12 : p);

/** A chord held for a bar, its root an octave down in the bass. */
function chordBar(bar: Bar, index: number, beats = 4): MusicNote[] {
  const r = root(bar.root);
  const start = index * beats;
  return [
    ...CHORDS[bar.quality].map((i): MusicNote => ({ pitch: padPitch(r + 12 + i), beat: start, length: beats - 0.25, gain: 0.35, role: 'pad' })),
    { pitch: bassPitch(r - 12), beat: start, length: beats / 2, gain: 0.55, role: 'bass' },
    { pitch: bassPitch(r - 12), beat: start + beats / 2, length: beats / 2 - 0.25, gain: 0.45, role: 'bass' },
  ];
}

const drum = (kind: DrumKind, at: number, gain: number): MusicNote => ({ pitch: 48, beat: at, length: 0.25, gain, role: 'perc', voice: kind });

/** A drum pattern repeated for `bars` bars of 4 beats. */
function drumPattern(bars: number, pattern: 'rock' | 'lofi' | 'shuffle'): MusicNote[] {
  const out: MusicNote[] = [];
  for (let b = 0; b < bars; b++) {
    const s = b * 4;
    if (pattern === 'rock') {
      out.push(drum('kick', s, 0.8), drum('kick', s + 2, 0.75), drum('snare', s + 1, 0.7), drum('snare', s + 3, 0.7));
      for (let h = 0; h < 8; h++) out.push(drum('hat', s + h * 0.5, 0.35));
    } else if (pattern === 'lofi') {
      out.push(drum('kick', s, 0.7), drum('kick', s + 1.75, 0.5), drum('snare', s + 1, 0.55), drum('snare', s + 3, 0.55));
      for (let h = 0; h < 4; h++) out.push(drum('hat', s + h + 0.5, 0.3));
    } else {
      out.push(drum('kick', s, 0.7), drum('snare', s + 1, 0.6), drum('kick', s + 2, 0.65), drum('snare', s + 3, 0.6));
      for (let h = 0; h < 4; h++) out.push(drum('hat', s + h, 0.4), drum('hat', s + h + 0.75, 0.25));
    }
  }
  return out;
}

const progression = (title: string, bars: Bar[], feel: { bpm: number; band: Band; drums?: 'rock' | 'lofi' | 'shuffle' }): MusicScore => ({
  title, bpm: feel.bpm, band: feel.band, notes: [...bars.flatMap((b, i) => chordBar(b, i)), ...(feel.drums ? drumPattern(bars.length, feel.drums) : [])],
});
const band = (melody: Voice, pad: Voice, bass: Voice): Band => ({ melody, pad, bass });
const bar = (r: string, quality: Quality): Bar => ({ root: r, quality });

const BLUES: Bar[] = ['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'E'].map((r) => bar(r, 'dom7'));

/** The score a preset starts from, or null for an id that is not a preset. */
export const buildPreset = (id: string): MusicScore | null => PRESETS.find((p) => p.id === id)?.build() ?? null;

export const PRESETS: TunePreset[] = [
  { id: 'blank', label: 'Blank page', hint: 'Nothing yet: tap squares to write every note yourself', build: () => ({ title: 'My tune', bpm: 100, notes: [], band: band('piano', 'piano', 'upright') }) },
  { id: 'beat', label: 'Drum beat', hint: 'A steady rock beat for 8 bars; add the rest', build: () => ({ title: 'My beat', bpm: 100, notes: drumPattern(8, 'rock'), band: band('piano', 'warmpad', 'bass') }) },
  { id: 'pop', label: 'Pop chords', hint: 'C, G, Am, F with a bass and a light beat: write a tune on top',
    build: () => progression('My pop tune', [bar('C', 'major'), bar('G', 'major'), bar('A', 'minor'), bar('F', 'major'), bar('C', 'major'), bar('G', 'major'), bar('A', 'minor'), bar('F', 'major')], { bpm: 100, band: band('piano', 'warmpad', 'bass'), drums: 'rock' }) },
  { id: 'lofi', label: 'Lo-fi loop', hint: 'Slow jazzy chords with a lazy beat for studying',
    build: () => progression('My lo-fi loop', [bar('D', 'min7'), bar('G', 'dom7'), bar('C', 'maj7'), bar('A', 'min7'), bar('D', 'min7'), bar('G', 'dom7'), bar('C', 'maj7'), bar('C', 'maj7')], { bpm: 76, band: band('epiano', 'epiano', 'upright'), drums: 'lofi' }) },
  { id: 'blues', label: '12-bar blues', hint: 'The classic twelve bars in A with a shuffle',
    build: () => progression('My blues', BLUES, { bpm: 92, band: band('piano', 'organ', 'upright'), drums: 'shuffle' }) },
  { id: 'ballad', label: 'Slow ballad', hint: 'Gentle chords in C minor with no drums',
    build: () => progression('My ballad', [bar('C', 'minor'), bar('G#', 'major'), bar('D#', 'major'), bar('A#', 'major'), bar('C', 'minor'), bar('G#', 'major'), bar('F', 'minor'), bar('G', 'dom7')], { bpm: 64, band: band('piano', 'warmpad', 'upright') }) },
];
