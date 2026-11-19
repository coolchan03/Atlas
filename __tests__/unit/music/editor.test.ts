import { DRUM_ROWS, MAX_NOTES, barCount, deleteNote, instrumentOf, moveNote, noteAt, setInstrument, setLength, setTempo, toMidi, toggleDrum, toggleNote, transpose } from '../../../src/music/editor';
import type { MusicScore } from '../../../src/music/types';

const base = (): MusicScore => ({ title: 'Test', bpm: 100, notes: [] });

describe('editing a tune on a grid', () => {
  it('adds a note on tap and removes it on the next tap, snapping to the grid', () => {
    let s = toggleNote(base(), { role: 'melody', pitch: 60, beat: 1.1 });
    expect(s.notes).toEqual([{ pitch: 60, beat: 1, length: 0.25, gain: 0.8, role: 'melody' }]);
    s = toggleNote(s, { role: 'melody', pitch: 60, beat: 1 });
    expect(s.notes).toEqual([]);
  });
  it('never changes the score it was given', () => {
    const s = base(); const frozen = JSON.stringify(s);
    toggleNote(s, { role: 'bass', pitch: 40, beat: 0 }); setTempo(s, 120); transpose(s, 2);
    expect(JSON.stringify(s)).toBe(frozen);
  });
  it('a tap inside a long note removes that note; lengths stay on the grid and inside the tune', () => {
    let s = toggleNote(base(), { role: 'melody', pitch: 64, beat: 0 });
    s = setLength(s, 0, 2.1);
    expect(s.notes[0].length).toBe(2);
    expect(noteAt(s, { role: 'melody', pitch: 64 }, 1.5)).toBe(0);
    expect(noteAt(s, { role: 'bass', pitch: 64 }, 1.5)).toBe(-1);
    expect(setLength(s, 0, 0).notes[0].length).toBe(0.25);
    expect(setLength(s, 9, 1)).toBe(s);
    expect(toggleNote(s, { role: 'melody', pitch: 64, beat: 1 }).notes).toHaveLength(0);
  });
  it('moves and transposes within the playable range, leaving drums alone', () => {
    let s = toggleNote(base(), { role: 'melody', pitch: 107, beat: 0 });
    s = toggleDrum(s, 'kick', 0);
    s = transpose(s, 5);
    expect(s.notes.find((n) => n.role === 'melody')!.pitch).toBe(108);
    expect(s.notes.find((n) => n.role === 'perc')!.pitch).toBe(36);
    expect(moveNote(s, 0, { pitch: -100, beat: 3.1 }).notes[0]).toMatchObject({ pitch: 24, beat: 3 });
    expect(deleteNote(s, 0).notes).toHaveLength(1);
  });
  it('gives each part its own instrument, and reads it back', () => {
    let s = toggleNote(base(), { role: 'melody', pitch: 60, beat: 0 });
    s = toggleNote(s, { role: 'bass', pitch: 36, beat: 0 });
    s = setInstrument(s, 'melody', 'flute');
    expect(instrumentOf(s, 'melody')).toBe('flute');
    expect(instrumentOf(s, 'bass')).toBeUndefined();
    expect(s.notes.find((n) => n.role === 'bass')!.voice).toBeUndefined();
    expect(s.band).toEqual({ melody: 'flute' });
  });
  it('toggles drum hits per kind and beat, on the drum pitches', () => {
    let s = toggleDrum(base(), 'snare', 1);
    expect(s.notes[0]).toMatchObject({ role: 'perc', voice: 'snare', pitch: DRUM_ROWS.find((r) => r.kind === 'snare')!.pitch, beat: 1 });
    s = toggleDrum(s, 'hat', 1);
    expect(s.notes).toHaveLength(2);
    expect(toggleDrum(s, 'snare', 1).notes).toHaveLength(1);
  });
  it('limits tempo, tune size and counts bars', () => {
    expect(setTempo(base(), 500).bpm).toBe(240);
    expect(setTempo(base(), 10).bpm).toBe(40);
    const full: MusicScore = { ...base(), notes: Array.from({ length: MAX_NOTES }, (_, i) => ({ pitch: 60, beat: (i % 100) * 0.25, length: 0.25, gain: 1 })) };
    expect(toggleNote(full, { role: 'pad', pitch: 70, beat: 50 }).notes).toHaveLength(MAX_NOTES);
    expect(barCount(base())).toBe(1);
    expect(barCount(toggleNote(base(), { role: 'melody', pitch: 60, beat: 9 }))).toBe(3);
  });
});

describe('MIDI export', () => {
  const text = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.slice(at, at + n));
  it('writes a valid format-1 file with a tempo and a track per part', () => {
    let s = toggleNote({ ...base(), bpm: 120 }, { role: 'melody', pitch: 60, beat: 0 });
    s = toggleDrum(s, 'kick', 0);
    s = setInstrument(s, 'melody', 'flute');
    const b = toMidi(s);
    expect(text(b, 0, 4)).toBe('MThd');
    expect([b[8], b[9]]).toEqual([0, 1]); // format 1
    expect([b[10], b[11]]).toEqual([0, 5]); // conductor + 4 parts
    const hex = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(hex).toContain('ff5103' + '07a120'); // 120 bpm = 500000 microseconds per beat
    expect(hex).toContain('c0' + '49'); // flute program 73 on channel 0
    expect(hex).toContain('903c'); // note on, middle C, channel 0
    expect(hex).toContain('9924'); // kick (36) on the drum channel
    expect((hex.match(/ff2f00/g) ?? []).length).toBe(5); // every track ends
  });
  it('is valid for an empty tune', () => {
    expect(toMidi(base()).length).toBeGreaterThan(30);
  });
});

it('shifts every note by a step and keeps them inside the grid', () => {
  const { shiftAll } = require('../../../src/music/editor');
  const s = { title: 't', bpm: 100, notes: [{ pitch: 60, beat: 0, length: 1, gain: 1 }, { pitch: 62, beat: 127.75, length: 1, gain: 1 }] };
  const out = shiftAll(s, 0.25);
  expect(out.notes[0].beat).toBe(0.25);
  expect(out.notes[1].beat).toBe(127.75);
  expect(shiftAll(s, -1).notes[0].beat).toBe(0);
});
