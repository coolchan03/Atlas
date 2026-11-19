import { critiqueScore, finishScore, REWRITE_BELOW, rewriteRequest } from '../../../src/music/critic';
import { harmonyPlan } from '../../../src/music/theory';
import { specFor } from '../../../src/music/styles';
import type { MusicNote, MusicScore } from '../../../src/music/types';

const plan = harmonyPlan(specFor('focus'), 8, 3);
const bpb = plan.beatsPerBar;

/** A tune a teacher would pass: bass roots, chords, and a melody whose short idea returns changed, with long and short notes. */
function goodTune(): MusicScore {
  const notes: MusicNote[] = [];
  plan.bars.forEach((bar, i) => {
    const b = i * bpb;
    notes.push({ pitch: 36 + ((bar.root - 36) % 12 + 12) % 12, beat: b, length: bpb, gain: 0.5, role: 'bass', voice: 'upright' });
    bar.tones.slice(0, 3).forEach((t) => notes.push({ pitch: 60 + ((t % 12) + 12) % 12, beat: b, length: bpb, gain: 0.25, role: 'pad', voice: 'warmpad' }));
    const base = 72 + ((bar.tones[0] % 12) + 12) % 12 - 12;
    const up = (i % 4 === 3) ? -1 : 1; // the idea goes up in three bars and answers downward in the fourth
    notes.push({ pitch: base, beat: b, length: 1, gain: 0.55, role: 'melody', voice: 'flute' });
    notes.push({ pitch: base + 2 * up, beat: b + 1, length: 0.5, gain: 0.5, role: 'melody', voice: 'flute' });
    notes.push({ pitch: base + 4 * up, beat: b + 1.5, length: 0.5, gain: 0.5, role: 'melody', voice: 'flute' });
    notes.push({ pitch: base + 2 * up, beat: b + 2, length: 2, gain: 0.55, role: 'melody', voice: 'flute' });
  });
  return { title: 't', bpm: 90, notes };
}

describe('listening to a written tune', () => {
  it('passes a tune with a melody, a returning idea, varied rhythm, a bass and chords', () => {
    const c = critiqueScore(goodTune(), plan);
    expect(c.issues).toEqual([]);
    expect(c.score).toBeGreaterThanOrEqual(REWRITE_BELOW);
  });

  it('marks down a tune with no melody, no bass and one instrument, worst problem first', () => {
    const pad = goodTune().notes.filter((n) => n.role === 'pad');
    const c = critiqueScore({ title: 't', bpm: 90, notes: pad }, plan);
    expect(c.score).toBeLessThan(REWRITE_BELOW);
    expect(c.issues[0]).toContain('no melody');
    expect(c.issues.join(' ')).toContain('no bass');
  });

  it('notices a melody that never repeats an idea, one that leaps, and one note length', () => {
    const base = goodTune();
    const melody = base.notes.filter((n) => n.role === 'melody').map((n, i) => ({ ...n, length: 1, pitch: 60 + ((i * 7) % 24) }));
    const c = critiqueScore({ ...base, notes: [...base.notes.filter((n) => n.role !== 'melody'), ...melody] }, plan);
    expect(c.issues.join(' ')).toMatch(/leaps too much/);
    expect(c.issues.join(' ')).toMatch(/same length/);
  });

  it('turns the issues into a rewrite request that keeps the original brief', () => {
    const c = critiqueScore({ title: 't', bpm: 90, notes: [] }, plan);
    const text = rewriteRequest('BRIEF', c);
    expect(text.startsWith('BRIEF')).toBe(true);
    expect(text).toContain('1. There is no melody');
    expect(text).toContain('only TITLE, BPM, NOTE and DRUM lines');
  });
});

describe('finishing a tune', () => {
  it('ends the melody and the bass on the home note, held to the end, and fades in and out', () => {
    const tune = goodTune();
    const done = finishScore(tune, plan);
    const lastMel = done.notes.filter((n) => n.role === 'melody').sort((a, b) => a.beat - b.beat).at(-1)!;
    const lastBass = done.notes.filter((n) => n.role === 'bass').sort((a, b) => a.beat - b.beat).at(-1)!;
    expect(lastMel.pitch % 12).toBe(plan.tonic);
    expect(lastBass.pitch % 12).toBe(plan.tonic);
    expect(lastMel.beat + lastMel.length).toBeGreaterThanOrEqual(plan.bars.length * bpb - 0.01);
    const first = done.notes.find((n) => n.beat === 0 && n.role === 'melody')!;
    const orig = tune.notes.find((n) => n.beat === 0 && n.role === 'melody')!;
    expect(first.gain).toBeLessThan(orig.gain);
    const lastBar = done.notes.find((n) => n.beat >= (plan.bars.length - 1) * bpb && n.role === 'pad')!;
    expect(lastBar.gain).toBeLessThan(0.25);
    expect(tune.notes[0].gain).toBe(0.5); // the original is not changed
  });
});
