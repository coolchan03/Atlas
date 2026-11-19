/**
 * Editing a tune by hand: switch notes on and off on a grid, change a note's length or pitch, give each part its own instrument, add
 * drum hits, and export the result as a standard MIDI file. Every function takes a score and returns a NEW score (nothing is changed
 * in place), so the screen can keep an undo list. Pitches are MIDI numbers; time is in beats. Pure.
 */
import type { DrumKind, MusicNote, MusicRole, MusicScore, Voice } from './types';

export const GRID = 0.25; // a sixteenth note
const MIN_PITCH = 24;
const MAX_PITCH = 108;
export const MAX_NOTES = 2000;
export const MAX_BEATS = 128;
const MAX_BPM = 240;
const MIN_BPM = 40;

const snap = (beat: number) => Math.max(0, Math.min(MAX_BEATS - GRID, Math.round(beat / GRID) * GRID));
const clampPitch = (p: number) => Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(p)));

/** Drum hits sit on fixed pitches in the grid (and in the MIDI file); the sound is chosen by `voice`. */
export const DRUM_ROWS: Array<{ kind: DrumKind; pitch: number }> = [
  { kind: 'kick', pitch: 36 }, { kind: 'snare', pitch: 38 }, { kind: 'clap', pitch: 39 }, { kind: 'hat', pitch: 42 }, { kind: 'openhat', pitch: 46 },
  { kind: 'tom', pitch: 45 }, { kind: 'rim', pitch: 37 }, { kind: 'cowbell', pitch: 56 }, { kind: 'shaker', pitch: 70 }, { kind: 'crash', pitch: 49 },
];

export const roleOf = (n: MusicNote): MusicRole => n.role ?? 'melody';

/** The index of the note of this role sounding at this pitch and beat, or -1. */
export function noteAt(score: MusicScore, cell: { role: MusicRole; pitch: number }, beat: number): number {
  const { role, pitch } = cell;
  return score.notes.findIndex((n) => roleOf(n) === role && n.pitch === pitch && beat >= n.beat - 1e-6 && beat < n.beat + Math.max(GRID, n.length) - 1e-6);
}

const withNotes = (score: MusicScore, notes: MusicNote[]): MusicScore => ({ ...score, notes: notes.slice(0, MAX_NOTES) });

/** Tapping a grid cell: a note is removed when the cell is part of one, otherwise a one-step note is added. */
export function toggleNote(score: MusicScore, cell: { role: MusicRole; pitch: number; beat: number }): MusicScore {
  const beat = snap(cell.beat); const pitch = clampPitch(cell.pitch);
  const at = noteAt(score, { role: cell.role, pitch }, beat);
  if (at >= 0) return withNotes(score, score.notes.filter((_, i) => i !== at));
  if (score.notes.length >= MAX_NOTES) return score;
  return withNotes(score, [...score.notes, { pitch, beat, length: GRID, gain: 0.8, role: cell.role }]);
}

/** Stretches or shortens one note (at least one step, never past the end of the grid). */
export function setLength(score: MusicScore, index: number, length: number): MusicScore {
  const n = score.notes[index];
  if (!n) return score;
  const len = Math.max(GRID, Math.min(MAX_BEATS - n.beat, Math.round(length / GRID) * GRID));
  return withNotes(score, score.notes.map((x, i) => (i === index ? { ...x, length: len } : x)));
}

export function moveNote(score: MusicScore, index: number, by: { pitch?: number; beat?: number }): MusicScore {
  const n = score.notes[index];
  if (!n) return score;
  return withNotes(score, score.notes.map((x, i) => (i === index ? { ...x, pitch: clampPitch(x.pitch + (by.pitch ?? 0)), beat: snap(x.beat + (by.beat ?? 0)) } : x)));
}

export function deleteNote(score: MusicScore, index: number): MusicScore { return withNotes(score, score.notes.filter((_, i) => i !== index)); }

/** Moves every pitched note of the chosen parts up or down by semitones (drums stay where they are). */
export function transpose(score: MusicScore, semitones: number, roles: MusicRole[] = ['melody', 'pad', 'bass']): MusicScore {
  return withNotes(score, score.notes.map((n) => (roles.includes(roleOf(n)) && roleOf(n) !== 'perc' ? { ...n, pitch: clampPitch(n.pitch + semitones) } : n)));
}

/** Gives one part (melody, pad or bass) its instrument: every note of that part, and the band the tune remembers. */
export function setInstrument(score: MusicScore, role: 'melody' | 'pad' | 'bass', voice: Voice): MusicScore {
  return { ...withNotes(score, score.notes.map((n) => (roleOf(n) === role ? { ...n, voice } : n))), band: { ...score.band, [role]: voice } };
}

/** The instrument a part currently uses: its notes' voice, else the band, else undefined (the style band decides). */
export function instrumentOf(score: MusicScore, role: 'melody' | 'pad' | 'bass'): Voice | undefined {
  const own = score.notes.find((n) => roleOf(n) === role && n.voice)?.voice as Voice | undefined;
  return own ?? score.band?.[role];
}

/** A drum hit on or off at a beat. */
export function toggleDrum(score: MusicScore, kind: DrumKind, beat: number): MusicScore {
  const row = DRUM_ROWS.find((r) => r.kind === kind);
  if (!row) return score;
  const b = snap(beat);
  const at = score.notes.findIndex((n) => roleOf(n) === 'perc' && n.voice === kind && Math.abs(n.beat - b) < 1e-6);
  if (at >= 0) return deleteNote(score, at);
  if (score.notes.length >= MAX_NOTES) return score;
  return withNotes(score, [...score.notes, { pitch: row.pitch, beat: b, length: GRID, gain: 0.8, role: 'perc', voice: kind }]);
}

export function setTempo(score: MusicScore, bpm: number): MusicScore { return { ...score, bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm))) }; }

/** The tune's length in whole bars (4 beats each), at least one. */
export function barCount(score: MusicScore): number {
  const end = score.notes.reduce((m, n) => Math.max(m, n.beat + Math.max(GRID, n.length)), 0);
  return Math.max(1, Math.ceil(end / 4));
}

// ------------------------------------------------------------------ MIDI export
const TICKS = 480;
const vlq = (n: number): number[] => { const out = [n & 0x7f]; let v = n >>> 7; while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>>= 7; } return out; };
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const chunk = (tag: string, body: number[]) => [...Array.from(tag).map((c) => c.charCodeAt(0)), ...be32(body.length), ...body];
const PROGRAM: Partial<Record<Voice, number>> = { piano: 0, epiano: 4, pluck: 24, driven: 29, organ: 16, bell: 14, saw: 81, pad: 89, bass: 33, sine: 80, flute: 73, clarinet: 71, oboe: 68, violin: 40, cello: 42, trumpet: 56, horn: 60, sax: 65, harp: 46, marimba: 12, vibes: 11, glock: 9, kalimba: 108, musicbox: 10, accordion: 21, harmonica: 22, banjo: 105, steeldrum: 114, choir: 52, harpsichord: 6, upright: 32, squarelead: 80, synthpluck: 84, warmpad: 89, glasspad: 92 };

/** A standard MIDI file (format 1: a tempo track, then one track per part; drums on channel 10). Opens in any music app. */
export function toMidi(score: MusicScore): Uint8Array {
  const tempo = Math.round(60_000_000 / Math.max(MIN_BPM, Math.min(MAX_BPM, score.bpm || 100)));
  const name = Array.from(new TextEncoder().encode((score.title || 'Atlas tune').slice(0, 60)));
  const head = chunk('MThd', [...be16(1), ...be16(1 + 4), ...be16(TICKS)]);
  const conductor = chunk('MTrk', [0, 0xff, 0x03, ...vlq(name.length), ...name, 0, 0xff, 0x51, 3, (tempo >>> 16) & 255, (tempo >>> 8) & 255, tempo & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0]);
  const parts: Array<{ role: MusicRole; channel: number }> = [{ role: 'melody', channel: 0 }, { role: 'pad', channel: 1 }, { role: 'bass', channel: 2 }, { role: 'perc', channel: 9 }];
  const tracks = parts.map(({ role, channel }) => {
    const events: Array<{ tick: number; order: number; bytes: number[] }> = [];
    if (role !== 'perc') {
      const program = PROGRAM[instrumentOf(score, role as 'melody' | 'pad' | 'bass') ?? 'piano'] ?? 0;
      events.push({ tick: 0, order: 0, bytes: [0xc0 | channel, program] });
    }
    for (const n of score.notes.filter((x) => roleOf(x) === role)) {
      const on = Math.round(n.beat * TICKS); const off = Math.round((n.beat + Math.max(GRID, n.length)) * TICKS);
      const velocity = Math.max(1, Math.min(127, Math.round((n.gain ?? 0.8) * 127)));
      events.push({ tick: on, order: 2, bytes: [0x90 | channel, n.pitch & 127, velocity] }, { tick: off, order: 1, bytes: [0x80 | channel, n.pitch & 127, 0] });
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const body: number[] = [];
    let last = 0;
    for (const e of events) { body.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
    body.push(0, 0xff, 0x2f, 0);
    return chunk('MTrk', body);
  });
  return Uint8Array.from([...head, ...conductor, ...tracks.flat()]);
}

/** The pitched instruments a part can be given, in the order the picker shows them. */
export const VOICE_LIST: Voice[] = ['piano', 'epiano', 'organ', 'harpsichord', 'pluck', 'driven', 'upright', 'bass', 'violin', 'cello', 'flute', 'clarinet', 'oboe', 'trumpet', 'horn', 'sax',
  'harp', 'marimba', 'vibes', 'glock', 'kalimba', 'musicbox', 'bell', 'accordion', 'harmonica', 'banjo', 'steeldrum', 'choir', 'saw', 'squarelead', 'synthpluck', 'pad', 'warmpad', 'glasspad', 'sine'];

/** Moves every note later (or earlier) by whole steps; notes never go before the start or past the end of the grid. */
export function shiftAll(score: MusicScore, beats: number): MusicScore {
  return withNotes(score, score.notes.map((n) => ({ ...n, beat: snap(n.beat + beats) })));
}
