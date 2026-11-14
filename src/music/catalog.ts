/**
 * The instruments the composer agent can ask for, in plain words, with the range each plays comfortably. The agent is shown this list,
 * and a score that names anything else is repaired or refused. Pure data, so the prompt and the checks always agree.
 */
import { DRUM_KINDS } from './instruments';
import type { DrumKind, Voice } from './types';

export type Family = 'keys' | 'strings' | 'woodwind' | 'brass' | 'plucked' | 'tuned percussion' | 'synth' | 'voice';
export interface InstrumentInfo { id: Voice; label: string; family: Family; /** Comfortable range, as note names. */ range: [string, string]; /** What it usually does in a band. */ part: 'melody' | 'harmony' | 'bass' }

export const INSTRUMENTS: InstrumentInfo[] = [
  { id: 'piano', label: 'Piano', family: 'keys', range: ['A1', 'C7'], part: 'harmony' },
  { id: 'epiano', label: 'Electric piano', family: 'keys', range: ['C2', 'C6'], part: 'harmony' },
  { id: 'organ', label: 'Organ', family: 'keys', range: ['C2', 'C6'], part: 'harmony' },
  { id: 'harpsichord', label: 'Harpsichord', family: 'keys', range: ['C2', 'C6'], part: 'melody' },
  { id: 'accordion', label: 'Accordion', family: 'keys', range: ['C3', 'C6'], part: 'harmony' },
  { id: 'violin', label: 'Violin', family: 'strings', range: ['G3', 'E6'], part: 'melody' },
  { id: 'cello', label: 'Cello', family: 'strings', range: ['C2', 'C5'], part: 'melody' },
  { id: 'pad', label: 'String section', family: 'strings', range: ['C2', 'C6'], part: 'harmony' },
  { id: 'harp', label: 'Harp', family: 'plucked', range: ['C2', 'C7'], part: 'harmony' },
  { id: 'pluck', label: 'Acoustic guitar', family: 'plucked', range: ['E2', 'E5'], part: 'harmony' },
  { id: 'driven', label: 'Electric guitar (distorted)', family: 'plucked', range: ['E2', 'E5'], part: 'melody' },
  { id: 'banjo', label: 'Banjo', family: 'plucked', range: ['C3', 'C6'], part: 'melody' },
  { id: 'bass', label: 'Electric bass', family: 'plucked', range: ['E2', 'G3'], part: 'bass' },
  { id: 'upright', label: 'Upright bass', family: 'plucked', range: ['E2', 'G3'], part: 'bass' },
  { id: 'flute', label: 'Flute', family: 'woodwind', range: ['C4', 'C7'], part: 'melody' },
  { id: 'clarinet', label: 'Clarinet', family: 'woodwind', range: ['E3', 'C6'], part: 'melody' },
  { id: 'oboe', label: 'Oboe', family: 'woodwind', range: ['B3', 'A6'], part: 'melody' },
  { id: 'sax', label: 'Saxophone', family: 'woodwind', range: ['A2', 'E5'], part: 'melody' },
  { id: 'harmonica', label: 'Harmonica', family: 'woodwind', range: ['C4', 'C7'], part: 'melody' },
  { id: 'trumpet', label: 'Trumpet', family: 'brass', range: ['E3', 'C6'], part: 'melody' },
  { id: 'horn', label: 'French horn', family: 'brass', range: ['C3', 'C5'], part: 'harmony' },
  { id: 'marimba', label: 'Marimba', family: 'tuned percussion', range: ['C3', 'C6'], part: 'melody' },
  { id: 'vibes', label: 'Vibraphone', family: 'tuned percussion', range: ['F3', 'F6'], part: 'melody' },
  { id: 'glock', label: 'Glockenspiel', family: 'tuned percussion', range: ['G4', 'C7'], part: 'melody' },
  { id: 'bell', label: 'Bells', family: 'tuned percussion', range: ['C4', 'C7'], part: 'melody' },
  { id: 'kalimba', label: 'Kalimba', family: 'tuned percussion', range: ['C4', 'C6'], part: 'melody' },
  { id: 'musicbox', label: 'Music box', family: 'tuned percussion', range: ['C5', 'C7'], part: 'melody' },
  { id: 'steeldrum', label: 'Steel drum', family: 'tuned percussion', range: ['C4', 'C6'], part: 'melody' },
  { id: 'choir', label: 'Choir "ah"', family: 'voice', range: ['C3', 'C6'], part: 'harmony' },
  { id: 'saw', label: 'Synth lead', family: 'synth', range: ['C3', 'C6'], part: 'melody' },
  { id: 'squarelead', label: 'Square-wave lead', family: 'synth', range: ['C3', 'C6'], part: 'melody' },
  { id: 'synthpluck', label: 'Synth pluck', family: 'synth', range: ['C3', 'C6'], part: 'melody' },
  { id: 'warmpad', label: 'Warm pad', family: 'synth', range: ['C2', 'C5'], part: 'harmony' },
  { id: 'glasspad', label: 'Glass pad', family: 'synth', range: ['C3', 'C6'], part: 'harmony' },
  { id: 'sine', label: 'Sine tone', family: 'synth', range: ['C2', 'C6'], part: 'melody' },
];

export const DRUM_LABELS: Record<DrumKind, string> = {
  kick: 'bass drum', snare: 'snare', hat: 'closed hi-hat', openhat: 'open hi-hat', clap: 'hand clap', tom: 'tom', rim: 'rim click', cowbell: 'cowbell', shaker: 'shaker', crash: 'crash cymbal',
};

export const instrumentById = (id: string): InstrumentInfo | undefined => INSTRUMENTS.find((i) => i.id === id);

/** The instrument list as the composer agent reads it: one line per family. */
export function instrumentsForPrompt(): string {
  const families = [...new Set(INSTRUMENTS.map((i) => i.family))];
  const lines = families.map((f) => `${f}: ${INSTRUMENTS.filter((i) => i.family === f).map((i) => `${i.id} (${i.label}, ${i.range[0]}-${i.range[1]}${i.part === 'bass' ? ', bass part' : ''})`).join('; ')}`);
  lines.push(`drums: ${DRUM_KINDS.map((d) => `${d} (${DRUM_LABELS[d]})`).join('; ')}`);
  return lines.join('\n');
}
