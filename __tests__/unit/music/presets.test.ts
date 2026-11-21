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

describe('what the review found', () => {
  it('exports each drum on its own key, with every hit on the editor grid, bass and chords inside range', () => {
    const score = PRESETS.find((p) => p.id === 'blues')!.build();
    const kinds = new Set(score.notes.filter((n) => n.role === 'perc').map((n) => n.voice));
    expect(kinds).toEqual(new Set(['kick', 'snare', 'hat']));
    const bytes: number[] = Array.from(toMidi(score));
    // note-on events on channel 10 (0x99): kick 36, snare 38 and hat 42 all appear
    const keys = new Set(bytes.flatMap((b, i) => (b === 0x99 && bytes[i + 1] >= 30 && bytes[i + 1] <= 50 && bytes[i + 2] > 0 ? [bytes[i + 1]] : [])));
    expect([...keys]).toEqual(expect.arrayContaining([36, 38, 42]));
    for (const p of PRESETS) {
      const s = p.build();
      expect(s.notes.every((n) => Math.abs(n.beat * 4 - Math.round(n.beat * 4)) < 1e-9)).toBe(true);
      expect(s.notes.filter((n) => n.role === 'bass').every((n) => n.pitch >= 40)).toBe(true);
      expect(s.notes.filter((n) => n.role === 'pad').every((n) => n.pitch <= 72)).toBe(true);
    }
  });
  it('buildPreset knows only the presets, and a sentence starting with Note is not a score line', () => {
    const { buildPreset } = require('../../../src/music/presets');
    const { parseAgentScore } = require('../../../src/music/agentScore');
    expect(buildPreset('nope')).toBeNull();
    expect(buildPreset('pop').title).toBe('My pop tune');
    expect(() => parseAgentScore('Note that I kept it simple.\nNOTE C4 0 1 0.5 piano')).toThrow(/1 usable\)/);
  });
});
