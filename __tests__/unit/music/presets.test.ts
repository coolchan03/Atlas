import { PRESETS } from '../../../src/music/presets';
import { toggleNote, toMidi } from '../../../src/music/editor';

describe('presets for making your own music', () => {
  it('offers a blank page and chord loops, each a valid score the editor can change', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['blank', 'beat', 'pop', 'lofi', 'blues', 'ballad']);
    for (const p of PRESETS) {
      const s = p.build();
      expect(s.title).toBeTruthy();
      expect(s.bpm).toBeGreaterThanOrEqual(40);
      expect(s.notes.every((n) => Number.isFinite(n.pitch) && n.beat >= 0 && n.beat < 128 && n.length > 0 && n.gain > 0 && n.gain <= 1)).toBe(true);
      expect(toMidi(s).length).toBeGreaterThan(20); // and it exports
      expect(toggleNote(s, { role: 'melody', pitch: 72, beat: 0 }).notes.length).toBe(s.notes.length + 1); // the editor can add a note to it
    }
  });
  it('the chord presets have chords, a bass and (where it fits) drums, and the ballad has none', () => {
    const roles = (id: string) => new Set(PRESETS.find((p) => p.id === id)!.build().notes.map((n) => n.role));
    expect(roles('pop')).toEqual(new Set(['pad', 'bass', 'perc']));
    expect(roles('ballad')).toEqual(new Set(['pad', 'bass']));
    expect(PRESETS.find((p) => p.id === 'blank')!.build().notes).toEqual([]);
    expect(PRESETS.find((p) => p.id === 'blues')!.build().notes.filter((n) => n.role === 'bass').length).toBe(24); // 12 bars, two bass notes each
  });
});
