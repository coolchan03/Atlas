import type { MusicMood } from '../../../src/music/composition';
import { composeInstrumental, parseMusicScore, renderMusic } from '../../../src/music/composition';

const source = 'TITLE: Morning study\nBPM: 110\nNOTE C4 0 1 0.8 pad\nNOTE E4 1 1 0.6\nNOTE G4 2 1 0.7\nNOTE C5 3 2 0.8\nLYRIC: should be ignored';

describe('Original instrumental music (no singing/lyrics)', () => {
  it('parses a bounded note score, never records lyrics', () => {
    const score = parseMusicScore(source);
    expect(score.notes).toHaveLength(4);
    expect(score.notes[0].role).toBe('pad');
    expect(score.bpm).toBe(110);
    expect('lyrics' in score).toBe(false);
  });
  it('rejects unstructured and unsafe-long scores', () => {
    expect(() => parseMusicScore('Great song!')).toThrow(/instrumental/);
    expect(() => parseMusicScore('NOTE Z4 0 1')).toThrow();
    expect(() => parseMusicScore(source.replace('110', '60').replace('NOTE C5 3 2', 'NOTE C5 96 12'))).toThrow(/limit/);
  });
  it('composes deterministic, multi-part notes without needing an AI model', () => {
    const a = composeInstrumental('Quiet music for reading', 'ambient');
    const b = composeInstrumental('Quiet music for reading', 'ambient');
    expect(a).toEqual(b);
    expect(a.notes.some((n) => n.role === 'pad')).toBe(true);
    expect(a.notes.some((n) => n.role === 'bass')).toBe(true);
    expect(a.notes.some((n) => n.role === 'melody')).toBe(true);
  });
  it('renders non-silent 30-second audio with no clipped samples and clean fade', () => {
    const pcm = renderMusic(composeInstrumental('Focus', 'study'), { preset: 'ambient', seconds: 30 });
    expect(pcm.length).toBe(480000);
    expect(pcm.some((sample) => sample !== 0)).toBe(true);
    expect(pcm[0]).toBe(0);
    expect(pcm[pcm.length - 1]).toBe(0);
    let peak = 0;
    for (const n of pcm) peak = Math.max(peak, Math.abs(n));
    expect(peak).toBeLessThan(32767);
  });
  it('caps runtime output and refuses extreme duration', () => {
    expect(() => renderMusic(parseMusicScore(source), { seconds: 200 })).toThrow(/duration/);
  });
});

describe('Style presets (jazz, vaporwave, eerie, seasons and holidays)', () => {
  const { STYLES } = require('../../../src/music/styles') as { STYLES: Record<string, { label: string; sound: 'keys' | 'bell' | 'synth' | 'ambient' }> };
  it.each(Object.keys(STYLES))('%s makes a deterministic, playable tune that renders to audio', (style) => {
    const a = composeInstrumental('a quiet evening', style as MusicMood);
    expect(composeInstrumental('a quiet evening', style as MusicMood)).toEqual(a);
    expect(a.title).toContain(STYLES[style].label);
    expect(a.notes.some((n: { role?: string }) => n.role === 'pad')).toBe(true);
    expect(a.notes.some((n: { role?: string }) => n.role === 'melody')).toBe(true);
    const pcm = renderMusic(a, { preset: STYLES[style].sound, seconds: 10 });
    expect(pcm.some((v) => v !== 0)).toBe(true);
    let peak = 0;
    for (const v of pcm) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThan(32767);
  });
  it('keeps each style apart: jazz swings, Christmas has sleigh ticks, eerie holds a drone', () => {
    const jazz = composeInstrumental('x', 'jazz');
    expect(jazz.notes.some((n) => n.role === 'melody' && !Number.isInteger(n.beat * 2))).toBe(true);
    expect(composeInstrumental('x', 'christmas').notes.some((n) => n.role === 'perc')).toBe(true);
    expect(composeInstrumental('x', 'eerie').notes.filter((n) => n.role === 'bass')).toHaveLength(8);
  });
});
