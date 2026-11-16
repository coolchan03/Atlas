/**
 * Playing the composer's notes on real instruments from a SoundFont, when one is installed: each of the composer's instrument names is a
 * General MIDI program (a piano, a violin, a fingered bass...) and each drum a key of the standard drum kit. With no SoundFont installed
 * nothing here applies and the built-in synthesiser plays as before.
 */
import { findPreset, parseSf2, renderNote, type Sf2 } from './soundfont';
import type { DrumKind, MusicNote, Voice } from './types';

/** The General MIDI program of each instrument name. A voice with no entry (a plain sine) stays synthesised. */
export const PROGRAM: Partial<Record<Voice, number>> = {
  piano: 0, epiano: 4, pluck: 25, driven: 29, organ: 16, bell: 14, saw: 81, pad: 49, bass: 33,
  flute: 73, clarinet: 71, oboe: 68, violin: 40, cello: 42, trumpet: 56, horn: 60, sax: 65, harp: 46, marimba: 12, vibes: 11, glock: 9,
  kalimba: 108, musicbox: 10, accordion: 21, harmonica: 22, banjo: 105, steeldrum: 114, choir: 52, harpsichord: 6, upright: 32,
  squarelead: 80, synthpluck: 84, warmpad: 89, glasspad: 92,
};

/** The key of each drum in the General MIDI drum kit. */
export const DRUM_KEY: Record<DrumKind, number> = { kick: 36, snare: 38, hat: 42, openhat: 46, clap: 39, tom: 45, rim: 37, cowbell: 56, shaker: 70, crash: 49 };

let active: Sf2 | null = null;
export const setActiveSoundfont = (sf: Sf2 | null): void => { active = sf; };
export const hasSoundfont = (): boolean => active !== null;

/** Reads a SoundFont file's bytes and makes it the one in use. */
export function loadSoundfontBytes(bytes: Uint8Array): Sf2 { const sf = parseSf2(bytes); active = sf; return sf; }

/** A drum hit's key when the composer asked by pitch (low is a kick, middle a snare, high a hat). */
const drumKeyByPitch = (pitch: number): number => (pitch < 60 ? 36 : pitch < 86 ? 38 : pitch < 91 ? 42 : 49);

/** The sound of one note played on the installed SoundFont, or null when there is none (or it has nothing for this instrument). */
export function sampledNote(note: MusicNote, name: Voice, o: { samples: number; rate: number }): Float32Array | null {
  if (!active) return null;
  const held = o.samples / o.rate;
  const gain = Number.isFinite(note.gain) ? note.gain : 1;
  let wave: Float32Array | null;
  if ((note.role ?? 'melody') === 'perc') {
    const key = typeof note.voice === 'string' && note.voice in DRUM_KEY ? DRUM_KEY[note.voice as DrumKind] : drumKeyByPitch(note.pitch);
    wave = renderNote(active, { bank: 128, program: 0, key, velocity: 100, held, rate: o.rate, maxTail: 1.2, oneShot: true });
  } else {
    const program = PROGRAM[name];
    if (program === undefined) return null;
    wave = renderNote(active, { bank: 0, program, key: Math.round(note.pitch), velocity: 100, held, rate: o.rate, maxTail: name === 'pad' || name === 'warmpad' || name === 'glasspad' || name === 'choir' ? 1.5 : 0.8 });
  }
  if (!wave) return null;
  // Recordings differ in loudness, but only so far as to even them out: a very quiet note is lifted at most twice, a loud one is brought down to a common ceiling,
  // and a drum is only kept from clipping, so a hat stays softer than a kick as it is on the recording. Then the score's own gain for the part is applied.
  let peak = 0;
  for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i]));
  const drum = (note.role ?? 'melody') === 'perc';
  const scale = peak > 0 ? (drum ? Math.min(1, 0.9 / peak) : Math.min(2, 0.55 / peak)) * gain : 0;
  for (let i = 0; i < wave.length; i++) wave[i] *= scale;
  return wave;
}

export const presetName = (bank: number, program: number): string => (active ? findPreset(active, bank, program)?.name ?? '' : '');
