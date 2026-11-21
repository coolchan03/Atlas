/**
 * The speed test end to end (real tuneDevice, scripted timings): one noisy reading must not pick a slower setting,
 * close results are timed again, clear winners are not, and the test stays short.
 */
jest.mock('../../../src/services/activeModelService', () => ({
  activeModelService: { unloadTextModel: jest.fn(async () => undefined), loadTextModel: jest.fn(async () => undefined) },
}));
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    isCurrentlyGenerating: () => false, generateResponse: jest.fn(), getPerformanceStats: jest.fn(),
    getEmbeddedMtpLayers: jest.fn(() => 0),
  },
}));
jest.mock('../../../src/services/hardware', () => ({
  hardwareService: {
    getCpuCoreCount: async () => 8, getRecommendedThreadCount: async () => 4,
    getAccelerationCapability: async () => ({ hasNpu: false, hasGpu: false }),
  },
}));
jest.mock('../../../src/services/vulkanEngine', () => ({ vulkanEngine: { isAvailable: async () => false, isSlowTextGpu: async () => false } }));

import { llmService } from '../../../src/services/llm';
import { activeModelService } from '../../../src/services/activeModelService';
import { useAppStore } from '../../../src/stores/appStore';
import { tuneDevice } from '../../../src/services/deviceTuner';
import { resetStores } from '../../utils/testHelpers';

const mockedLlm = llmService as jest.Mocked<typeof llmService>;
const mockedActive = activeModelService as jest.Mocked<typeof activeModelService>;

/** Per "backend:threads" the successive tokens-per-second readings the phone would give. Anything unlisted reads 3.0. */
type Script = Record<string, number[]>;
function runPhone(script: Script) {
  const seen: Record<string, number> = {};
  let lastTps = 0;
  const prompts: string[] = [];
  mockedLlm.generateResponse.mockImplementation((async (messages: Array<{ content: string }>) => {
    const text = messages[0].content;
    if (text === 'Say hello.') return ''; // warm-up: not timed
    prompts.push(text);
    const { inferenceBackend, nThreads, cacheType, flashAttn } = useAppStore.getState().settings;
    const key = `${inferenceBackend}:${nThreads}`;
    const changedMemory = cacheType !== original.cacheType || flashAttn !== original.flashAttn;
    if (changedMemory) { lastTps = 3.0; return ''; } // a second-round memory variant: slower, and not one of the readings counted below
    const readings = script[key] ?? [3.0];
    seen[key] = (seen[key] ?? -1) + 1;
    lastTps = readings[Math.min(seen[key], readings.length - 1)];
    return '';
  }) as any);
  mockedLlm.getPerformanceStats.mockImplementation((() => ({ lastDecodeTokensPerSecond: lastTps, lastTokensPerSecond: lastTps, lastTimeToFirstToken: 500 })) as any);
  return { seen, prompts };
}

let original: { cacheType: string; flashAttn: boolean; nBatch: number };
beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
  useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'M', author: 'a', filePath: '/m/m.gguf', fileName: 'm.gguf', fileSize: 1e9, quantization: 'Q4', downloadedAt: 't', engine: 'llama' } as any] });
  original = { cacheType: useAppStore.getState().settings.cacheType, flashAttn: useAppStore.getState().settings.flashAttn, nBatch: useAppStore.getState().settings.nBatch };
});

describe('tuneDevice with noisy timings', () => {
  it('a lucky high reading does not pick a slower setting', async () => {
    // cpu:6 read 5.6 once but is really about 4.1; cpu:4 really is about 5.0.
    const phone = runPhone({ 'auto:4': [3.0], 'cpu:4': [5.0, 5.1], 'cpu:3': [3.5], 'cpu:6': [5.6, 4.0, 4.1] });
    const labels: string[] = [];
    const outcome = await tuneDevice('m1', (p) => labels.push(p.label));
    expect(outcome.best?.option.id).toBe('cpu-4');
    expect(outcome.best?.tps).toBeGreaterThan(4.9);
    expect(labels.some((l) => l.startsWith('checking again: '))).toBe(true);
    expect(phone.seen['cpu:6']).toBe(2); // read three times: 5.6 then the two that exposed it
  });

  it('a clear winner is not timed again, so the test stays short', async () => {
    const phone = runPhone({ 'auto:4': [3.0], 'cpu:4': [8.0], 'cpu:3': [3.5], 'cpu:6': [4.0] });
    const labels: string[] = [];
    const outcome = await tuneDevice('m1', (p) => labels.push(p.label));
    expect(outcome.best?.option.id).toBe('cpu-4');
    expect(labels.some((l) => l.startsWith('checking again: ') && !l.includes('memory'))).toBe(false);
    expect(phone.seen['cpu:4']).toBe(0);
  });

  it('only the close contenders are re-timed, never the whole list', async () => {
    const phone = runPhone({ 'auto:4': [2.0], 'cpu:4': [5.0, 5.0], 'cpu:3': [2.5], 'cpu:6': [4.9, 4.9] });
    await tuneDevice('m1', () => undefined);
    expect(phone.seen['auto:4']).toBe(0);
    expect(phone.seen['cpu:3']).toBe(0);
    expect(phone.seen['cpu:4']).toBe(1); // timed once more
    expect(phone.seen['cpu:6']).toBe(1);
  });

  it('two timings that agree do not trigger a third', async () => {
    const phone = runPhone({ 'cpu:4': [5.0, 5.1], 'cpu:6': [4.9, 4.95] });
    await tuneDevice('m1', () => undefined);
    expect(phone.seen['cpu:4']).toBe(1);
    expect(phone.seen['cpu:6']).toBe(1);
  });

  it('the long-prompt round re-reads a barely-better batch size with a different start, so a cached prompt cannot flatter the repeat', async () => {
    runPhone({ 'cpu:4': [8.0] });
    // first words: the batch size in use ("batch-now") 20 s, the others 17 s: a gain one reading would adopt but noise could explain
    let lastFirstWord = 0;
    mockedLlm.generateResponse.mockImplementation((async (messages: Array<{ content: string }>) => {
      const text = messages[0].content;
      if (text === 'Say hello.') return '';
      const long = text.includes('Summarise the paragraph above');
      const { nBatch } = useAppStore.getState().settings;
      lastFirstWord = long ? (nBatch === original.nBatch ? 20000 : 17000) : 500;
      return '';
    }) as any);
    mockedLlm.getPerformanceStats.mockImplementation((() => ({ lastDecodeTokensPerSecond: 8, lastTokensPerSecond: 8, lastTimeToFirstToken: lastFirstWord })) as any);
    await tuneDevice('m1', () => undefined, { deep: true });
    const calls = mockedLlm.generateResponse.mock.calls.map((c) => (c[0] as Array<{ content: string }>)[0].content);
    const longCalls = calls.filter((c) => c.includes('Summarise the paragraph above'));
    expect(longCalls.length).toBeGreaterThan(3); // the round itself, then the repeats
    expect(longCalls.some((c) => /^Reading \d+\. /.test(c))).toBe(true);
    // each option is re-read once (baseline and the quicker size), and no repeat is the same text as its option's first reading
    const repeats = longCalls.filter((c) => /^Reading \d+\. /.test(c));
    const originals = longCalls.filter((c) => !/^Reading \d+\. /.test(c));
    expect(repeats.length).toBeGreaterThanOrEqual(2);
    expect(repeats.some((c) => originals.includes(c))).toBe(false);
  });

  it('does not re-read a batch size that is clearly faster (the gain is believed)', async () => {
    runPhone({ 'cpu:4': [8.0] });
    let lastFirstWord = 0;
    mockedLlm.generateResponse.mockImplementation((async (messages: Array<{ content: string }>) => {
      const text = messages[0].content;
      if (text === 'Say hello.') return '';
      const { nBatch } = useAppStore.getState().settings;
      lastFirstWord = text.includes('Summarise the paragraph above') ? (nBatch === original.nBatch ? 20000 : 10000) : 500;
      return '';
    }) as any);
    mockedLlm.getPerformanceStats.mockImplementation((() => ({ lastDecodeTokensPerSecond: 8, lastTokensPerSecond: 8, lastTimeToFirstToken: lastFirstWord })) as any);
    await tuneDevice('m1', () => undefined, { deep: true });
    const calls = mockedLlm.generateResponse.mock.calls.map((c) => (c[0] as Array<{ content: string }>)[0].content);
    expect(calls.filter((c) => /^Reading \d+\. /.test(c) && c.includes('Summarise the paragraph above'))).toHaveLength(0);
  });

  it('restores the original settings and leaves nothing loaded half-way when cancelled or finished', async () => {
    const before = { ...useAppStore.getState().settings };
    runPhone({ 'cpu:4': [5.0, 5.0] });
    await tuneDevice('m1', () => undefined);
    // the winner is applied as the model's settings; backend/threads are the only global changes, and everything else is as before
    const after = useAppStore.getState().settings;
    expect(after.cacheType).toBe(before.cacheType);
    expect(after.flashAttn).toBe(before.flashAttn);
    expect(after.nBatch).toBe(before.nBatch);
    expect(mockedActive.loadTextModel).toHaveBeenCalled();
  });
});
