import { conformScore, harmonyPlan, planText, THEORY_PRIMER } from '../../../src/music/theory';
import { STYLES } from '../../../src/music/styles';
import { composeMusic, composerBrief, composerSystemPrompt } from '../../../src/music/composerAgent';

const pc = (p: number) => ((p % 12) + 12) % 12;

describe('the harmony plan', () => {
  const plan = harmonyPlan(STYLES.jazz, 16, 3);
  it('gives a key, a scale and a chord for every bar, built from the notes of that scale', () => {
    expect(plan.bars).toHaveLength(16);
    expect(plan.scaleName).toBe('Dorian');
    for (const bar of plan.bars) {
      expect(plan.scale).toEqual(expect.arrayContaining(bar.tones)); // every chord note is a note of the scale
      expect(bar.tones[0]).toBe(bar.root);
      expect(bar.name).toMatch(/^[A-G][b#]?(m|maj|dim|aug)?(7|maj7)?$/);
    }
    const text = planText(plan);
    expect(text).toMatch(/^KEY: [A-G][b#]? Dorian\. Scale notes: /);
    expect(text).toMatch(/Bar 1: \S+ \(.+\); bass root/);
    expect(text.split('\n')).toHaveLength(2 + 16);
  });
  it('keeps the same key for the same request and style', () => {
    expect(harmonyPlan(STYLES.jazz, 8, 3).tonic).toBe(harmonyPlan(STYLES.jazz, 8, 3).tonic);
  });
});

describe('correcting a written score', () => {
  const plan = harmonyPlan(STYLES.focus, 8, 0); // C major: I V vi IV...
  const bar1 = plan.bars[0];
  const note = (pitch: number, beat: number, role: 'melody' | 'bass' | 'pad', length = 1) => ({ pitch, beat, length, gain: 0.5, role });

  it('moves a note outside the key to the nearest note in it', () => {
    const { score, changed } = conformScore({ title: 't', bpm: 90, notes: [note(66, 1, 'melody')] }, plan); // F# (not in C major) off the strong beat
    expect(plan.scale).toContain(pc(score.notes[0].pitch));
    expect(Math.abs(score.notes[0].pitch - 66)).toBe(1);
    expect(changed.outOfKey).toBe(1);
  });
  it('lands the melody on a chord tone on the strong beats, and leaves a passing note on a weak beat alone', () => {
    const passing = plan.scale.find((p) => !bar1.tones.includes(p))!; // a scale note that is not in the chord
    const strong = 60 + pc(passing - 60);
    const out = conformScore({ title: 't', bpm: 90, notes: [note(strong, 0, 'melody'), note(strong, 1, 'melody')] }, plan);
    expect(bar1.tones).toContain(pc(out.score.notes[0].pitch)); // beat 0 is strong
    expect(pc(out.score.notes[1].pitch)).toBe(pc(passing)); // beat 1 is weak: a passing note is fine
  });
  it('makes the bass play the chord root on the first beat of each bar', () => {
    const wrong = bar1.tones.find((t) => t !== bar1.root)!;
    const { score, changed } = conformScore({ title: 't', bpm: 90, notes: [note(36 + pc(wrong - 36), 0, 'bass', 4)] }, plan);
    expect(pc(score.notes[0].pitch)).toBe(bar1.root);
    expect(changed.bassRoots).toBe(1);
  });
  it('puts timings on a quarter-beat grid, moves parts into their range, and leaves drums alone', () => {
    const drum = { pitch: 48, beat: 0.13, length: 0.2, gain: 0.5, role: 'perc' as const, voice: 'kick' as const };
    const { score, changed } = conformScore({ title: 't', bpm: 90, notes: [note(bar1.root + 24, 0.13, 'melody', 0.9), note(bar1.root + 72, 2, 'bass'), drum] }, plan);
    expect(score.notes[0].beat).toBe(0.25);
    expect(score.notes[0].length).toBe(1);
    expect(score.notes[1].pitch).toBeLessThanOrEqual(60); // a bass is kept low
    expect(score.notes[2]).toEqual(drum);
    expect(changed.grid).toBeGreaterThan(0);
    expect(changed.range).toBeGreaterThan(0);
  });
});

describe('the composer uses the plan', () => {
  it('tells the model the key, scale and every bar\'s chord, and the theory it must follow', () => {
    const brief = composerBrief('a calm focus tune', 'focus', 60);
    expect(brief.text).toMatch(/KEY: [A-G][b#]? major/);
    expect(brief.text).toMatch(/Bar 1: /);
    expect(brief.text).toMatch(new RegExp(`Bar ${brief.bars}: `));
    expect(composerSystemPrompt()).toContain(THEORY_PRIMER);
    expect(composerSystemPrompt()).toMatch(/lands on a note of that bar's chord/);
  });
  it('corrects what the model writes against the plan and says how many notes were adjusted', async () => {
    const lines = ['TITLE: Out of key', 'BPM: 90'];
    for (let i = 0; i < 16; i++) lines.push(`NOTE F#4 ${i} 0.75 0.5 piano`); // F# is not in any major key plan built on C, and falls on chord-and-passing beats
    const ask = async () => lines.join('\n');
    const composed = await composeMusic('calm focus', { ask, style: 'focus', seconds: 30 });
    expect(composed.via).toBe('composer');
    const brief = composerBrief('calm focus', 'focus', 30);
    for (const n of composed.score.notes) expect(brief.plan.scale).toContain(pc(n.pitch));
    expect(composed.note).toMatch(/\d+ notes? adjusted to fit the key and chords/);
    expect(composed.note).toMatch(/in [A-G][b#]? major/);
  });
});
