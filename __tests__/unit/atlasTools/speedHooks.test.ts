import { lastPromptReuse, promptReuseOf, recordLlamaTimings, reuseNote } from '../../../src/atlasTools/speedHooks';

describe('prompt reuse', () => {
  it('is the part of the prompt the engine did not have to read again', () => {
    expect(promptReuseOf({ tokens_evaluated: 1800, timings: { prompt_n: 300 } })).toEqual({ promptTokens: 1800, processedTokens: 300, reusedTokens: 1500 });
    expect(promptReuseOf({ tokens_evaluated: 500, timings: { prompt_n: 500 } })?.reusedTokens).toBe(0);
  });

  it('is unknown when the engine did not say, never a made-up zero', () => {
    expect(promptReuseOf({})).toBeNull();
    expect(promptReuseOf({ tokens_evaluated: 0, timings: { prompt_n: 0 } })).toBeNull();
    expect(promptReuseOf(null)).toBeNull();
  });

  it('is remembered from the last completion and written into the log line', () => {
    recordLlamaTimings({ tokens_evaluated: 1000, timings: { prompt_n: 100, prompt_per_second: 40, predicted_per_second: 5, predicted_n: 20 } });
    expect(lastPromptReuse()?.reusedTokens).toBe(900);
    expect(reuseNote()).toBe(', prompt 1000 tokens (900 reused from the cache, 100 read)');
    recordLlamaTimings({});
    expect(reuseNote()).toBe('');
  });
});
