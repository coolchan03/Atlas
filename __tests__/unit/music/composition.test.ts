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
    const pcm = renderMusic(composeInstrumental('Focus', 'study'), 'ambient', 16000, 30);
    expect(pcm.length).toBe(480000);
    expect(pcm.some((sample) => sample !== 0)).toBe(true);
    expect(pcm[0]).toBe(0);
    expect(pcm[pcm.length - 1]).toBe(0);
    let peak = 0;
    for (const n of pcm) peak = Math.max(peak, Math.abs(n));
    expect(peak).toBeLessThan(32767);
  });
  it('caps runtime output and refuses extreme duration', () => {
    expect(() => renderMusic(parseMusicScore(source), 'keys', 16000, 200)).toThrow(/duration/);
  });
});
