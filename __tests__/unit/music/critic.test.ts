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
    expect(lastBass.pitch).toBeGreaterThanOrEqual(28);
    expect(lastBass.pitch).toBeLessThanOrEqual(60);
    expect(tune.notes[0].gain).toBe(0.5); // the original is not changed
  });
});

describe('reading the plan back from a finished tune', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { inferPlan, scoreToText } = require('../../../src/music/theory');
  const { parseAgentScore } = require('../../../src/music/agentScore');

  it('finds the home note, the scale and each bar\'s chord root from the notes', () => {
    const tune = finishScore(goodTune(), plan);
    const read = inferPlan(tune, bpb)!;
    expect(read.tonic).toBe(plan.tonic);
    expect(read.bars).toHaveLength(plan.bars.length);
    // the last bar is the one finishing moved onto the home note
    expect(read.bars.slice(0, -1).map((b: { root: number }) => b.root)).toEqual(plan.bars.slice(0, -1).map((b) => b.root));
    expect(read.bars.at(-1).root).toBe(plan.tonic);
    // every chord tone the tune plays in a bar is in that bar's chord
    read.bars.slice(0, -1).forEach((b: { tones: number[] }, i: number) => plan.bars[i].tones.slice(0, 3).forEach((t) => expect(b.tones).toContain(t)));
  });

  it('writes a tune as the composer\'s own line format, and reads it back note for note', () => {
    const text = scoreToText(goodTune());
    expect(text.split('\n').slice(0, 2)).toEqual(['TITLE: t', 'BPM: 90']);
    const back = parseAgentScore(text);
    expect(back.score.notes.length).toBe(goodTune().notes.length);
    expect(back.instruments).toEqual(expect.arrayContaining(['Flute', 'Upright bass', 'Warm pad']));
  });

  it('gives nothing for a tune with no pitched notes', () => {
    expect(inferPlan({ title: 't', bpm: 90, notes: [{ pitch: 48, beat: 0, length: 0.2, gain: 0.5, role: 'perc', voice: 'kick' }] })).toBeNull();
  });

  it('leaves the first bar at full loudness when told the section joins a tune already playing', () => {
    const tune = goodTune();
    const orig = tune.notes.find((n) => n.beat === 0 && n.role === 'melody')!;
    expect(finishScore(tune, plan, { fadeIn: false }).notes.find((n) => n.beat === 0 && n.role === 'melody')!.gain).toBe(orig.gain);
    expect(finishScore(tune, plan).notes.find((n) => n.beat === 0 && n.role === 'melody')!.gain).toBeLessThan(orig.gain);
  });
});
