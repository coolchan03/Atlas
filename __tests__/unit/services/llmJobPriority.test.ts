/**
 * A chat reply goes before background work: a background model call that is writing is stopped, the reply starts at once, and the job asks again
 * after the reply instead of using the cut-off answer. Only the engine is faked.
 */
const state = { generating: false, stops: 0 };
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    isCurrentlyGenerating: () => state.generating,
    stopGeneration: jest.fn(async () => { state.stops += 1; state.generating = false; }),
    waitForIdle: jest.fn(async () => true),
  },
}));
jest.mock('../../../src/atlasTools/runtimePower', () => ({ holdScreenAwake: jest.fn(), releaseScreenAwake: jest.fn() }));

import { runBackgroundJob, yieldToChat } from '../../../src/services/llmJobQueue';

beforeEach(() => { state.generating = false; state.stops = 0; });

it('does nothing when no background job is writing', async () => {
  expect(await yieldToChat()).toBe(false);
  state.generating = true; // a chat reply of its own: not a background job to stop
  expect(await yieldToChat()).toBe(false);
  expect(state.stops).toBe(0);
});

it('stops a writing job for a chat reply, discards its cut-off answer and runs it again afterwards', async () => {
  let calls = 0;
  let release: () => void = () => undefined;
  const firstStarted = new Promise<void>((resolve) => { release = resolve; });
  const job = jest.fn(async () => {
    calls += 1;
    if (calls === 1) {
      state.generating = true; release();
      await new Promise((r) => setTimeout(r, 30)); // still "writing" when the chat arrives
      return 'cut off';
    }
    return 'complete';
  });
  const result = runBackgroundJob(job);
  await firstStarted;
  expect(await yieldToChat()).toBe(true);
  expect(state.stops).toBe(1);
  await expect(result).resolves.toBe('complete');
  expect(job).toHaveBeenCalledTimes(2);
});

it('gives up after a few restarts, and says so, rather than returning a cut-off answer as if it were whole', async () => {
  let calls = 0;
  const job = jest.fn(async () => { calls += 1; state.generating = true; await new Promise((r) => setTimeout(r, 5)); await yieldToChat(); return `cut off ${calls}`; });
  await expect(runBackgroundJob(job)).rejects.toThrow(/needed for chat replies too often/);
  expect(job.mock.calls.length).toBe(4);
});
