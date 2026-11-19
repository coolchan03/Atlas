import { fromMidi } from '../../../src/music/midiImport';
import { toMidi } from '../../../src/music/editor';
import type { MusicNote, MusicScore } from '../../../src/music/types';

const tune = (): MusicScore => {
  const notes: MusicNote[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4;
    notes.push({ pitch: 36 + bar, beat: b, length: 4, gain: 0.5, role: 'bass', voice: 'upright' });
    for (const p of [60, 64, 67]) notes.push({ pitch: p + bar, beat: b, length: 4, gain: 0.25, role: 'pad', voice: 'warmpad' });
    notes.push({ pitch: 72 + bar, beat: b, length: 1, gain: 0.6, role: 'melody', voice: 'flute' });
    notes.push({ pitch: 74 + bar, beat: b + 1.5, length: 0.5, gain: 0.55, role: 'melody', voice: 'flute' });
    notes.push({ pitch: 76, beat: b + 2, length: 2, gain: 0.6, role: 'melody', voice: 'flute' });
    notes.push({ pitch: 36, beat: b, length: 0.25, gain: 0.8, role: 'perc', voice: 'kick' }, { pitch: 42, beat: b + 0.5, length: 0.25, gain: 0.4, role: 'perc', voice: 'hat' });
  }
  return { title: 'Round trip', bpm: 96, notes };
};
const key = (n: MusicNote) => `${n.role}|${n.pitch}|${n.beat}|${n.length}`;

describe('reading a MIDI file', () => {
  it('gets back the notes of a tune Atlas exported: parts, pitches, timing, tempo, title and drums', () => {
    const back = fromMidi(toMidi(tune()), 'x.mid');
    expect(back.title).toBe('Round trip');
    expect(back.bpm).toBe(96);
    const want = tune().notes.map(key).sort();
    const got = back.notes.map(key).sort();
    expect(got).toEqual(want);
  });

  it('puts the lowest channel on the bass, the chords on the pad and the rest on the melody, and keeps the instruments', () => {
    const back = fromMidi(toMidi(tune()));
    expect(new Set(back.notes.filter((n) => n.role === 'bass').map((n) => n.voice))).toEqual(new Set(['upright']));
    expect(new Set(back.notes.filter((n) => n.role === 'pad').map((n) => n.voice))).toEqual(new Set(['warmpad']));
    expect(new Set(back.notes.filter((n) => n.role === 'melody').map((n) => n.voice))).toEqual(new Set(['flute']));
    expect(back.notes.filter((n) => n.role === 'perc').map((n) => n.voice).sort()).toEqual([...Array(4).fill('hat'), ...Array(4).fill('kick')]);
  });

  it('moves out-of-range pitches by octaves and takes the file name as the title when the file has none', () => {
    const bytes = toMidi({ title: '', bpm: 100, notes: [{ pitch: 12, beat: 0, length: 1, gain: 0.5, role: 'melody' }, { pitch: 120, beat: 1, length: 1, gain: 0.5, role: 'melody' }] });
    const back = fromMidi(bytes, 'my_song-v2.mid');
    expect(back.title).toBe('my song v2');
    expect(back.notes.map((n) => n.pitch)).toEqual([24, 108]);
  });

  it.each([
    ['not a MIDI file', Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), /not a MIDI file/],
    ['a cut-off file', toMidi(tune()).slice(0, 40), /ends too early|no notes/],
    ['an empty song', toMidi({ title: 'x', bpm: 100, notes: [] }), /no notes/],
    ['a file over 2 MB', new Uint8Array(2 * 1024 * 1024 + 1), /larger than 2 MB/],
  ])('says what is wrong with %s', (_name, bytes, message) => { expect(() => fromMidi(bytes as Uint8Array)).toThrow(message as RegExp); });

  it('turns a tune with only drums away', () => {
    expect(() => fromMidi(toMidi({ title: 'x', bpm: 100, notes: [{ pitch: 36, beat: 0, length: 0.25, gain: 0.8, role: 'perc', voice: 'kick' }] }))).toThrow(/only drums/);
  });
});
