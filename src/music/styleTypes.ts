import type { SoundPreset, Voice } from './types';

export type StyleGroup = 'Moods and genres' | 'Eras and genres' | 'Seasons and holidays' | 'Places and settings';

export type Bass = 'root' | 'walk' | 'pulse' | 'drone';
/** How the chords are played: held, on the off-beat, in stabs, as eighths, in an arpeggio, oom-pah, a jig, an Alberti figure, a swung comp, a strum or a bossa pattern. */
export type Comp = 'sustain' | 'offbeat' | 'stabs' | 'eighths' | 'arp' | 'oompah' | 'jig' | 'alberti' | 'swingcomp' | 'strum' | 'bossa';
export type Perc = 'none' | 'soft' | 'four' | 'swing' | 'sleigh' | 'industrial' | 'backbeat' | 'offbeat';
export type Tune = 'arp' | 'walk' | 'sparse';

export interface StyleSpec {
  label: string;
  group: StyleGroup;
  /** The instrument sound that suits the style; the person can still change it. */
  sound: SoundPreset;
  bpm: number;
  beatsPerBar: 3 | 4 | 6;
  /** Semitone steps of the scale. */
  scale: number[];
  /** Chord roots as scale degrees, one per bar, for the first 8 bars (the A section). */
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
  /** How the chords are played. Left out, it follows the bar length. */
  comp?: Comp;
  /** The instrument for each part. Left out, all three come from `sound`. */
  band?: Partial<Record<'melody' | 'pad' | 'bass', Voice>>;
  /** Chords for bars 9 to 16 (the B section). Left out, the first eight are played in the other order. */
  progressionB?: number[];
}

