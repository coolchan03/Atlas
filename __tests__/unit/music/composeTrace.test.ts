/** Every tune records what the model was asked, what it answered, why it was accepted or rejected, and, for a built-in result, why. */
import { installNativeBoundary } from '../../harness/nativeBoundary';
import { composeMusic } from '../../../src/music/composerAgent';
import { clearComposeRuns, composeRuns, describeRun, fallbackReasonOf, startRun, recordAttempt, finishRun } from '../../../src/music/composeTrace';

function goodScore(): string {
  const lines = ['TITLE: Rainy Window', 'BPM: 84'];
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4;
    lines.push(`NOTE C3 ${b} 4 0.45 upright`, `NOTE C4 ${b} 4 0.25 warmpad`, `NOTE E4 ${b} 4 0.25 warmpad`, `NOTE G4 ${b} 4 0.25 warmpad`);
    lines.push(`NOTE E5 ${b} 1.5 0.55 flute`, `NOTE D5 ${b + 1.5} 0.5 0.5 flute`, `NOTE C5 ${b + 2} 2 0.55 flute`);
    lines.push(`DRUM kick ${b} 0.8`, `DRUM snare ${b + 1} 0.6`, `DRUM hat ${b + 0.5} 0.3`);
  }
  return lines.join('\n');
}

beforeAll(() => { installNativeBoundary({ fs: true }); });
beforeEach(() => clearComposeRuns());

describe('the record of a tune', () => {
  it('a tune the AI wrote says so, with each question, its size, its answer and its outcome', async () => {
    const out = await composeMusic('rainy window', { ask: async () => goodScore() });
    expect(out.via).toBe('composer');
    const run = out.diagnostics!;
    expect(run.via).toBe('composer');
    expect(run.fallbackReason).toBeUndefined();
    const score = run.attempts.filter((a) => a.stage === 'score');
    expect(score.length).toBeGreaterThanOrEqual(1);
    expect(score.some((a) => a.outcome === 'accepted')).toBe(true);
    expect(score.every((a) => a.promptChars > 0 && a.replyChars > 0 && a.replyHead.startsWith('TITLE: Rainy Window'))).toBe(true);
    expect(run.attempts.some((a) => a.stage === 'title')).toBe(true);
    expect(composeRuns()).toHaveLength(1);
  });

  it('prose instead of a score is recorded as rejected, with the checker\'s reason and how the reply began', async () => {
    const out = await composeMusic('a rainy day jazz cafe', { ask: async () => 'Sure! Here is a lovely song about rain.' });
    expect(out.via).toBe('built-in');
    const run = out.diagnostics!;
    const rejected = run.attempts.filter((a) => a.stage === 'score' && a.outcome === 'rejected');
    expect(rejected.length).toBe(2); // asked twice
    expect(rejected[0].reason).toBeTruthy();
    expect(rejected[0].replyHead).toMatch(/^Sure! Here is a lovely song/);
    expect(run.fallbackReason).toMatch(/checker rejected/);
    expect(run.fallbackReason).toMatch(/Sure! Here is a lovely song/);
  });

  it('an empty answer says so (a model that wrote nothing, not a model that wrote something wrong)', async () => {
    const out = await composeMusic('lullaby', { ask: async () => '' });
    expect(out.diagnostics!.fallbackReason).toMatch(/answered with nothing/);
  });

  it('a model that fails is recorded as an error with the message, and is not asked again when there is none', async () => {
    const ask = jest.fn(async () => { throw new Error('No model selected'); });
    const out = await composeMusic('lullaby', { ask });
    const run = out.diagnostics!;
    expect(run.attempts[0]).toMatchObject({ stage: 'score', outcome: 'error', reason: 'No model selected' });
    expect(run.fallbackReason).toMatch(/failed after \d+ s: No model selected/);
    expect(run.via).toBe('built-in');
  });

  it('the readable report names the outcome, the model facts and why it fell back', async () => {
    const out = await composeMusic('a rainy day jazz cafe', { ask: async () => 'no' });
    const text = describeRun(out.diagnostics!);
    expect(text).toMatch(/^\[MUSIC-RUN\] built-in composer;/);
    expect(text).toMatch(/1\. score: rejected/);
    expect(text).toMatch(/Why built-in:/);
  });

  it('keeps only the last few tunes', async () => {
    for (let i = 0; i < 7; i++) await composeMusic(`tune ${i}`, { ask: async () => 'no' });
    expect(composeRuns()).toHaveLength(5);
    expect(composeRuns()[4].request).toBe('tune 6');
  });
});

describe('fallbackReasonOf', () => {
  it('blames a model that was never asked, and a result with no score request', () => {
    const run = startRun({ request: 'x', style: 'focus', model: '' });
    expect(fallbackReasonOf(run)).toMatch(/never asked/);
    recordAttempt(run, { stage: 'title', prompt: 'p', reply: 'A Title', ms: 10 });
    expect(fallbackReasonOf(run, 'note text')).toBe('note text');
  });
  it('finishRun records the totals and only a built-in result gets a reason', () => {
    const run = startRun({ request: 'x', style: 'focus', model: 'Gemma' }, 1000);
    recordAttempt(run, { stage: 'score', prompt: 'p', reply: 'r', ms: 5 });
    finishRun(run, { via: 'composer', note: 'ok' }, 4000);
    expect(run).toMatchObject({ via: 'composer', totalMs: 3000 });
    expect(run.fallbackReason).toBeUndefined();
  });
});
