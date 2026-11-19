import { COMPARISON_SENTENCES, recommend, scoreRun, type EngineRun } from '../../../src/atlasVoice/voiceCompare';

const run = (o: Partial<EngineRun> = {}): EngineRun => ({ engine: 'pocket', sizeMB: 200, ramMB: 400, firstAudioSec: 0.9, realTimeFactor: 2, intelligibility: 4, naturalness: 3, similarity: 3, glitches: 0, licenceOk: true, ...o });

describe('voice engine comparison', () => {
  it('includes the weak spots: short opening vowels, numbers and long prose', () => {
    expect(COMPARISON_SENTENCES.some((s) => /^I\b/.test(s))).toBe(true);
    expect(COMPARISON_SENTENCES.some((s) => /^I'm\b/.test(s))).toBe(true);
    expect(COMPARISON_SENTENCES.some((s) => /\d/.test(s))).toBe(true);
    expect(COMPARISON_SENTENCES.some((s) => s.length > 120)).toBe(true);
  });
  it('penalises glitches and flags a voice too slow for calls', () => {
    expect(scoreRun(run({ glitches: 2 })).score).toBeLessThan(scoreRun(run()).score);
    expect(scoreRun(run({ firstAudioSec: 4 })).usableInCalls).toBe(false);
    expect(scoreRun(run({ licenceOk: false })).notes.join(' ')).toMatch(/Licence/);
  });
  it('keeps the current voice unless a licensed candidate is clearly better', () => {
    const slowBetter = run({ engine: 'big', naturalness: 5, similarity: 5, intelligibility: 5, firstAudioSec: 6, realTimeFactor: 0.4 });
    const r = recommend(run(), [slowBetter, run({ engine: 'same' })]);
    expect(r.calls).toBe('pocket'); // better but too slow for live calls
    expect(r.offline).toBe('big'); // fine for reading aloud
    expect(recommend(run(), [run({ engine: 'unlicensed', naturalness: 5, similarity: 5, intelligibility: 5, licenceOk: false })]).offline).toBe('pocket');
    expect(recommend(run(), [run({ engine: 'glitchy', naturalness: 5, similarity: 5, intelligibility: 5, glitches: 1 })]).offline).toBe('pocket');
  });
});
