import { noteStage, resetStageTimes, stageSummary } from '../../../src/atlasTools/stageTimes';
import { recordLlamaTimings } from '../../../src/atlasTools/speedHooks';

beforeEach(() => resetStageTimes());

describe('where the time went', () => {
  it('says nothing until something has been timed, then one line per stage in a fixed order', () => {
    expect(stageSummary()).toEqual([]);
    noteStage('writing', 6000);
    noteStage('loading', 3200);
    expect(stageSummary()).toEqual(['loading: last 3.20 s, typical 3.20 s (1 timed)', 'writing: last 6.00 s, typical 6.00 s (1 timed)']);
  });

  it('shows the last time and the typical (median) time, and ignores impossible values', () => {
    for (const ms of [1000, 9000, 2000, -5, NaN, 99_999_999]) noteStage('tools', ms);
    expect(stageSummary()).toEqual(['tools: last 2.00 s, typical 2.00 s (3 timed)']);
  });

  it('keeps only the last 20', () => {
    for (let i = 1; i <= 25; i += 1) noteStage('retrieval', i * 100);
    expect(stageSummary()[0]).toContain('(20 timed)');
    expect(stageSummary()[0]).toContain('last 2.50 s');
  });

  it('is filled from the engine\'s own timings: reading the prompt and writing are separate stages', () => {
    recordLlamaTimings({ timings: { prompt_ms: 4200, predicted_ms: 9000, prompt_n: 300, predicted_n: 40, predicted_per_second: 4.4, prompt_per_second: 70 } });
    const text = stageSummary().join('\n');
    expect(text).toContain('prompt: last 4.20 s');
    expect(text).toContain('writing: last 9.00 s');
  });

  it('appears in the support report, so a person can send it', async () => {
    noteStage('first word', 12_000);
    const { gatherSupportReport } = require('../../../src/atlasTools/supportReport');
    const report: string = await gatherSupportReport();
    expect(report).toContain('Where the time went (last requests)');
    expect(report).toContain('first word: last 12.0 s');
  });
});
