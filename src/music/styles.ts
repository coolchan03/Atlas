/**
 * Style presets for the built-in composer: jazz, vaporwave, eerie fog, the seasons and holidays.
 * Each style is plain data (tempo, scale, chords, rhythm), so a new one needs no new code. Every tune is original:
 * no famous melody is used, only the feel (bells for Christmas, a slow waltz for winter, and so on).
 */
import { composeFromSpec, seedFor } from './arrange';
import type { StyleGroup, StyleSpec } from './styleTypes';
import type { MusicNote } from './types';

export type { StyleGroup, StyleSpec };

export type StyleMood =
  | 'jazz' | 'vaporwave' | 'eerie' | 'bossa' | 'lofi' | 'noir' | 'space' | 'rain' | 'spa' | 'campfire' | 'chiptune' | 'western'
  | 'spring' | 'summer' | 'fall' | 'winter'
  | 'thanksgiving' | 'halloween' | 'christmas' | 'newyear' | 'valentines' | 'easter' | 'july4' | 'stpatricks' | 'lunarnewyear' | 'cincodemayo'
  | 'italian' | 'frenchcafe' | 'tiki' | 'tavern' | 'shanty' | 'carnival'
  | 'twenties' | 'fifties' | 'surf' | 'disco' | 'retro80s' | 'pop' | 'rock' | 'funk' | 'reggae' | 'country' | 'blues' | 'classical' | 'lullaby' | 'march' | 'edm' | 'hiphop';


const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTATONIC = [0, 2, 4, 7, 9, 0, 2];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10];
const BLUES = [0, 3, 5, 6, 7, 10, 12];

const TRIAD = [0, 2, 4];
const SEVENTH = [0, 2, 4, 6];
const NINTH = [0, 2, 4, 6, 8];

export const STYLES: Record<StyleMood, StyleSpec> = {
  jazz: { label: 'Jazz', group: 'Moods and genres', sound: 'epiano', bpm: 120, beatsPerBar: 4, scale: DORIAN, progression: [1, 4, 0, 5, 1, 4, 0, 0], chord: SEVENTH, tune: 'walk', density: 6, swing: 0.34, bass: 'walk', perc: 'swing', padGain: 0.13 },
  vaporwave: { label: 'Vaporwave', group: 'Moods and genres', sound: 'ambient', bpm: 64, beatsPerBar: 4, scale: MAJOR, progression: [0, 5, 3, 4, 0, 5, 1, 4], chord: NINTH, tune: 'sparse', density: 3, swing: 0, bass: 'root', perc: 'soft', padGain: 0.2 },
  eerie: { label: 'Eerie fog', group: 'Moods and genres', sound: 'ambient', bpm: 62, beatsPerBar: 4, scale: PHRYGIAN, progression: [0, 1, 0, 5, 0, 1, 4, 1], chord: [0, 1, 3], tune: 'sparse', density: 2, swing: 0, bass: 'drone', perc: 'industrial', padGain: 0.17 },
  spring: { label: 'Spring', group: 'Seasons and holidays', sound: 'keys', bpm: 104, beatsPerBar: 4, scale: PENTATONIC, progression: [0, 3, 4, 0, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'pulse', perc: 'soft', padGain: 0.15 },
  summer: { label: 'Summer', group: 'Seasons and holidays', sound: 'synth', bpm: 112, beatsPerBar: 4, scale: LYDIAN, progression: [0, 4, 5, 3, 0, 4, 1, 3], chord: SEVENTH, tune: 'walk', density: 8, swing: 0.12, bass: 'pulse', perc: 'four', padGain: 0.16 },
  fall: { label: 'Fall', group: 'Seasons and holidays', sound: 'keys', bpm: 76, beatsPerBar: 4, scale: DORIAN, progression: [0, 5, 3, 4, 0, 5, 1, 4], chord: SEVENTH, tune: 'arp', density: 8, swing: 0, bass: 'root', perc: 'none', padGain: 0.2 },
  winter: { label: 'Winter', group: 'Seasons and holidays', sound: 'bell', bpm: 72, beatsPerBar: 3, scale: MAJOR, progression: [0, 5, 3, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 6, swing: 0, bass: 'root', perc: 'none', padGain: 0.14 },
  thanksgiving: { label: 'Thanksgiving', group: 'Seasons and holidays', sound: 'guitar', bpm: 84, beatsPerBar: 4, scale: MAJOR, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'root', perc: 'none', padGain: 0.18 },
  halloween: { label: 'Halloween', group: 'Seasons and holidays', sound: 'bell', bpm: 96, beatsPerBar: 4, scale: HARMONIC_MINOR, progression: [0, 0, 5, 4, 0, 0, 5, 4], chord: TRIAD, tune: 'walk', density: 4, swing: 0.1, bass: 'pulse', perc: 'industrial', padGain: 0.16 },
  christmas: { label: 'Christmas', group: 'Seasons and holidays', sound: 'bell', bpm: 100, beatsPerBar: 4, scale: MAJOR, progression: [0, 3, 0, 4, 0, 5, 3, 0], chord: TRIAD, tune: 'walk', density: 4, swing: 0, bass: 'root', perc: 'sleigh', padGain: 0.14 },
  newyear: { label: 'New Year', group: 'Seasons and holidays', sound: 'synth', bpm: 124, beatsPerBar: 4, scale: MAJOR, progression: [0, 4, 5, 3, 0, 4, 5, 3], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.16 },
  valentines: { label: 'Valentine', group: 'Seasons and holidays', sound: 'keys', bpm: 66, beatsPerBar: 3, scale: MINOR, progression: [0, 5, 3, 4, 0, 5, 1, 4], chord: SEVENTH, tune: 'walk', density: 3, swing: 0, bass: 'root', perc: 'none', padGain: 0.18 },
  bossa: { label: 'Bossa nova', group: 'Moods and genres', sound: 'guitar', bpm: 108, beatsPerBar: 4, scale: DORIAN, progression: [1, 4, 0, 5, 1, 4, 0, 0], chord: SEVENTH, tune: 'walk', density: 4, swing: 0.08, bass: 'pulse', perc: 'soft', padGain: 0.14 },
  lofi: { label: 'Lo-fi chill', group: 'Moods and genres', sound: 'epiano', bpm: 76, beatsPerBar: 4, scale: DORIAN, progression: [1, 4, 0, 5, 1, 4, 0, 3], chord: SEVENTH, tune: 'sparse', density: 4, swing: 0.2, bass: 'root', perc: 'swing', padGain: 0.16 },
  noir: { label: 'Noir detective', group: 'Moods and genres', sound: 'epiano', bpm: 70, beatsPerBar: 4, scale: HARMONIC_MINOR, progression: [0, 5, 1, 4, 0, 3, 1, 4], chord: SEVENTH, tune: 'sparse', density: 3, swing: 0.25, bass: 'walk', perc: 'swing', padGain: 0.15 },
  space: { label: 'Space', group: 'Moods and genres', sound: 'ambient', bpm: 60, beatsPerBar: 4, scale: LYDIAN, progression: [0, 4, 0, 5, 0, 4, 1, 4], chord: NINTH, tune: 'sparse', density: 2, swing: 0, bass: 'drone', perc: 'none', padGain: 0.2 },
  rain: { label: 'Rainy day', group: 'Moods and genres', sound: 'keys', bpm: 66, beatsPerBar: 4, scale: MINOR, progression: [0, 5, 3, 4, 0, 5, 3, 4], chord: SEVENTH, tune: 'arp', density: 4, swing: 0, bass: 'root', perc: 'none', padGain: 0.17 },
  spa: { label: 'Spa and calm', group: 'Moods and genres', sound: 'ambient', bpm: 60, beatsPerBar: 4, scale: PENTATONIC, progression: [0, 3, 0, 4, 0, 3, 0, 4], chord: TRIAD, tune: 'sparse', density: 2, swing: 0, bass: 'drone', perc: 'none', padGain: 0.2 },
  campfire: { label: 'Campfire', group: 'Moods and genres', sound: 'guitar', bpm: 90, beatsPerBar: 4, scale: MIXOLYDIAN, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'root', perc: 'none', padGain: 0.14 },
  chiptune: { label: '8-bit game', group: 'Moods and genres', sound: 'synth', bpm: 138, beatsPerBar: 4, scale: MAJOR, progression: [0, 5, 3, 4, 0, 5, 1, 4], chord: TRIAD, tune: 'arp', density: 16, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.1 },
  western: { label: 'Western', group: 'Moods and genres', sound: 'guitar', bpm: 84, beatsPerBar: 4, scale: BLUES, progression: [0, 0, 3, 0, 4, 3, 0, 0], chord: TRIAD, tune: 'sparse', density: 3, swing: 0, bass: 'pulse', perc: 'soft', padGain: 0.14 },
  easter: { label: 'Easter', group: 'Seasons and holidays', sound: 'bell', bpm: 108, beatsPerBar: 4, scale: PENTATONIC, progression: [0, 3, 4, 0, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'pulse', perc: 'soft', padGain: 0.14 },
  july4: { label: 'Fourth of July', group: 'Seasons and holidays', sound: 'organ', bpm: 116, beatsPerBar: 4, scale: MAJOR, progression: [0, 4, 0, 3, 0, 4, 5, 0], chord: TRIAD, tune: 'walk', density: 8, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.18 },
  stpatricks: { label: "St. Patrick's Day", group: 'Seasons and holidays', sound: 'guitar', bpm: 112, beatsPerBar: 6, scale: MIXOLYDIAN, progression: [0, 6, 0, 3, 0, 6, 3, 0], chord: TRIAD, tune: 'walk', density: 6, swing: 0, bass: 'pulse', perc: 'soft', padGain: 0.14 },
  lunarnewyear: { label: 'Lunar New Year', group: 'Seasons and holidays', sound: 'bell', bpm: 104, beatsPerBar: 4, scale: PENTATONIC, progression: [0, 3, 4, 0, 0, 3, 4, 0], chord: TRIAD, tune: 'walk', density: 8, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.14 },
  cincodemayo: { label: 'Cinco de Mayo', group: 'Seasons and holidays', sound: 'guitar', bpm: 124, beatsPerBar: 6, scale: PHRYGIAN_DOMINANT, progression: [0, 0, 3, 0, 4, 3, 0, 0], chord: TRIAD, tune: 'walk', density: 6, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.14 },
  italian: { label: 'Italian restaurant', group: 'Places and settings', sound: 'guitar', bpm: 116, beatsPerBar: 6, scale: MAJOR, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'walk', density: 6, swing: 0, bass: 'pulse', perc: 'soft', padGain: 0.14 },
  frenchcafe: { label: 'French cafe', group: 'Places and settings', sound: 'keys', bpm: 96, beatsPerBar: 3, scale: MAJOR, progression: [1, 4, 0, 5, 1, 4, 0, 0], chord: SEVENTH, tune: 'walk', density: 3, swing: 0, bass: 'pulse', perc: 'none', padGain: 0.15 },
  tiki: { label: 'Tiki lounge', group: 'Places and settings', sound: 'bell', bpm: 100, beatsPerBar: 4, scale: PENTATONIC, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: SEVENTH, tune: 'walk', density: 4, swing: 0.15, bass: 'pulse', perc: 'soft', padGain: 0.15 },
  tavern: { label: 'Medieval tavern', group: 'Places and settings', sound: 'guitar', bpm: 108, beatsPerBar: 6, scale: DORIAN, progression: [0, 6, 0, 3, 0, 6, 3, 0], chord: [0, 4], tune: 'walk', density: 6, swing: 0, bass: 'pulse', perc: 'soft', padGain: 0.14 },
  shanty: { label: 'Pirate sea shanty', group: 'Places and settings', sound: 'guitar', bpm: 102, beatsPerBar: 6, scale: DORIAN, progression: [0, 6, 0, 3, 0, 6, 3, 0], chord: TRIAD, tune: 'arp', density: 6, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.14 },
  carnival: { label: 'Carnival', group: 'Places and settings', sound: 'organ', bpm: 132, beatsPerBar: 3, scale: MAJOR, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'walk', density: 6, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.14 },
  twenties: { label: '1920s', group: 'Eras and genres', sound: 'keys', bpm: 150, beatsPerBar: 4, scale: MAJOR, progression: [0, 0, 3, 0, 4, 4, 0, 0], chord: SEVENTH, tune: 'walk', density: 8, swing: 0.28, bass: 'pulse', perc: 'swing', padGain: 0.12 },
  fifties: { label: '1950s', group: 'Eras and genres', sound: 'epiano', bpm: 96, beatsPerBar: 4, scale: MAJOR, progression: [0, 5, 3, 4, 0, 5, 3, 4], chord: TRIAD, tune: 'walk', density: 6, swing: 0.2, bass: 'pulse', perc: 'backbeat', padGain: 0.15 },
  surf: { label: 'Surf rock', group: 'Eras and genres', sound: 'guitar', bpm: 148, beatsPerBar: 4, scale: HARMONIC_MINOR, progression: [0, 0, 3, 3, 4, 4, 0, 0], chord: TRIAD, tune: 'arp', density: 16, swing: 0, bass: 'pulse', perc: 'backbeat', padGain: 0.12 },
  disco: { label: 'Disco', group: 'Eras and genres', sound: 'synth', bpm: 118, beatsPerBar: 4, scale: DORIAN, progression: [0, 3, 1, 4, 0, 3, 1, 4], chord: SEVENTH, tune: 'walk', density: 8, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.14 },
  retro80s: { label: 'Retro 80s synth', group: 'Eras and genres', sound: 'synth', bpm: 112, beatsPerBar: 4, scale: MINOR, progression: [0, 5, 2, 6, 0, 5, 2, 6], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'pulse', perc: 'backbeat', padGain: 0.18 },
  pop: { label: 'Pop', group: 'Eras and genres', sound: 'keys', bpm: 108, beatsPerBar: 4, scale: MAJOR, progression: [0, 4, 5, 3, 0, 4, 5, 3], chord: TRIAD, tune: 'walk', density: 8, swing: 0, bass: 'pulse', perc: 'backbeat', padGain: 0.16 },
  rock: { label: 'Rock', group: 'Eras and genres', sound: 'overdrive', bpm: 128, beatsPerBar: 4, scale: MIXOLYDIAN, progression: [0, 6, 3, 0, 0, 6, 3, 4], chord: [0, 4], tune: 'walk', density: 8, swing: 0, bass: 'pulse', perc: 'backbeat', padGain: 0.2 },
  funk: { label: 'Funk', group: 'Eras and genres', sound: 'epiano', bpm: 104, beatsPerBar: 4, scale: DORIAN, progression: [0, 0, 3, 0, 0, 0, 3, 4], chord: SEVENTH, tune: 'walk', density: 8, swing: 0.1, bass: 'pulse', perc: 'backbeat', padGain: 0.12 },
  reggae: { label: 'Reggae', group: 'Eras and genres', sound: 'organ', bpm: 78, beatsPerBar: 4, scale: MAJOR, progression: [0, 3, 0, 4, 0, 3, 0, 4], chord: TRIAD, tune: 'sparse', density: 4, swing: 0, bass: 'root', perc: 'offbeat', padGain: 0.14 },
  country: { label: 'Country', group: 'Eras and genres', sound: 'guitar', bpm: 112, beatsPerBar: 4, scale: MAJOR, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'pulse', perc: 'backbeat', padGain: 0.14 },
  blues: { label: 'Blues', group: 'Eras and genres', sound: 'guitar', bpm: 92, beatsPerBar: 4, scale: BLUES, progression: [0, 0, 0, 0, 3, 3, 0, 4], chord: SEVENTH, tune: 'walk', density: 6, swing: 0.3, bass: 'walk', perc: 'swing', padGain: 0.14 },
  classical: { label: 'Classical', group: 'Eras and genres', sound: 'keys', bpm: 84, beatsPerBar: 4, scale: MAJOR, progression: [0, 3, 4, 0, 5, 3, 4, 0], chord: TRIAD, tune: 'arp', density: 8, swing: 0, bass: 'root', perc: 'none', padGain: 0.14 },
  lullaby: { label: 'Lullaby', group: 'Eras and genres', sound: 'bell', bpm: 66, beatsPerBar: 3, scale: PENTATONIC, progression: [0, 3, 0, 4, 0, 3, 4, 0], chord: TRIAD, tune: 'sparse', density: 3, swing: 0, bass: 'root', perc: 'none', padGain: 0.12 },
  march: { label: 'March', group: 'Eras and genres', sound: 'organ', bpm: 116, beatsPerBar: 4, scale: MAJOR, progression: [0, 0, 3, 3, 4, 4, 0, 0], chord: TRIAD, tune: 'walk', density: 4, swing: 0, bass: 'pulse', perc: 'backbeat', padGain: 0.18 },
  edm: { label: 'Dance and EDM', group: 'Eras and genres', sound: 'synth', bpm: 128, beatsPerBar: 4, scale: MINOR, progression: [0, 5, 2, 6, 0, 5, 2, 6], chord: TRIAD, tune: 'arp', density: 16, swing: 0, bass: 'pulse', perc: 'four', padGain: 0.16 },
  hiphop: { label: 'Boom bap beat', group: 'Eras and genres', sound: 'epiano', bpm: 90, beatsPerBar: 4, scale: DORIAN, progression: [0, 0, 3, 3, 0, 0, 4, 3], chord: SEVENTH, tune: 'sparse', density: 4, swing: 0.2, bass: 'pulse', perc: 'backbeat', padGain: 0.14 },
};

export const isStyleMood = (mood: string): mood is StyleMood => mood in STYLES;


/** How each style plays its chords, where it differs from the bar length. */
const COMP: Partial<Record<StyleMood, StyleSpec['comp']>> = {
  jazz: 'swingcomp', lofi: 'swingcomp', noir: 'swingcomp', blues: 'swingcomp', bossa: 'bossa', funk: 'stabs', disco: 'stabs', edm: 'stabs', reggae: 'offbeat',
  rock: 'eighths', surf: 'eighths', summer: 'eighths', pop: 'arp', retro80s: 'arp', chiptune: 'arp', spring: 'arp', newyear: 'arp', classical: 'alberti',
  country: 'strum', campfire: 'strum', western: 'strum', thanksgiving: 'strum', frenchcafe: 'oompah', march: 'oompah', fifties: 'strum', tiki: 'offbeat', cincodemayo: 'jig',
};

/** The instrument for each part where the style is not simply one instrument for everything. */
const BAND: Partial<Record<StyleMood, StyleSpec['band']>> = {
  jazz: { melody: 'bell', pad: 'epiano', bass: 'bass' }, lofi: { melody: 'epiano', pad: 'epiano', bass: 'bass' }, noir: { melody: 'epiano', pad: 'pad', bass: 'bass' },
  bossa: { melody: 'pluck', pad: 'pluck', bass: 'bass' }, funk: { melody: 'saw', pad: 'epiano', bass: 'bass' }, disco: { melody: 'saw', pad: 'epiano', bass: 'bass' },
  rock: { melody: 'driven', pad: 'driven', bass: 'bass' }, surf: { melody: 'pluck', pad: 'pluck', bass: 'bass' }, country: { melody: 'pluck', pad: 'pluck', bass: 'bass' },
  blues: { melody: 'pluck', pad: 'epiano', bass: 'bass' }, reggae: { melody: 'pluck', pad: 'organ', bass: 'bass' }, retro80s: { melody: 'saw', pad: 'pad', bass: 'bass' },
  edm: { melody: 'saw', pad: 'saw', bass: 'bass' }, pop: { melody: 'piano', pad: 'pad', bass: 'bass' }, classical: { melody: 'piano', pad: 'piano', bass: 'bass' },
  twenties: { melody: 'piano', pad: 'piano', bass: 'bass' }, fifties: { melody: 'epiano', pad: 'piano', bass: 'bass' }, italian: { melody: 'pluck', pad: 'pluck', bass: 'bass' },
  cincodemayo: { melody: 'pluck', pad: 'pluck', bass: 'bass' }, christmas: { melody: 'bell', pad: 'pad', bass: 'bass' }, winter: { melody: 'bell', pad: 'pad', bass: 'bass' },
  halloween: { melody: 'bell', pad: 'pad', bass: 'bass' }, chiptune: { melody: 'saw', pad: 'saw', bass: 'bass' }, summer: { melody: 'saw', pad: 'epiano', bass: 'bass' },
  march: { melody: 'organ', pad: 'organ', bass: 'bass' }, carnival: { melody: 'bell', pad: 'organ', bass: 'bass' }, tavern: { melody: 'pluck', pad: 'pluck', bass: 'bass' }, shanty: { melody: 'pluck', pad: 'organ', bass: 'bass' },
};

/** The style with its chord pattern and band filled in. */
export const specFor = (mood: StyleMood): StyleSpec => ({ ...STYLES[mood], comp: STYLES[mood].comp ?? COMP[mood], band: STYLES[mood].band ?? BAND[mood] });

/** A seeded 16-bar tune in one of the styles above, with the band it was written for. The same prompt always makes the same tune. */
export function composeStyled(prompt: string, mood: StyleMood): { title: string; bpm: number; notes: MusicNote[]; band?: StyleSpec['band'] } {
  const spec = specFor(mood);
  const label = prompt.trim().replace(/[\r\n]+/g, ' ').slice(0, 56) || spec.label;
  return { title: `${label} (${spec.label})`, bpm: spec.bpm, notes: composeFromSpec(spec, seedFor(prompt, mood)), band: spec.band };
}
