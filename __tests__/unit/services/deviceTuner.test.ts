import { pickBest, refineOptions, tuneOptions, type TuneResult } from '../../../src/services/deviceTuner';
import { shouldOfferFirstTest, shouldSuggestTuning, useTuned } from '../../../src/atlasTools/speed';

const result = (id: string, threads: number, tps: number, error?: string): TuneResult =>
  ({ option: { id, label: id, backend: 'cpu' as any, threads }, tps, firstWordSec: 1, error });

describe('finding the best settings', () => {
  it('tries automatic acceleration, then the CPU with the recommended, fewer and a couple more threads', () => {
    expect(tuneOptions(8, 4).map((o) => o.id)).toEqual(['auto', 'cpu-4', 'cpu-3', 'cpu-6']);
    expect(tuneOptions(8, 6).map((o) => o.id)).toEqual(['auto', 'cpu-6', 'cpu-4', 'cpu-8']);
    expect(tuneOptions(4, 4).map((o) => o.id)).toEqual(['auto', 'cpu-4', 'cpu-3']);
    expect(tuneOptions(2, 2).map((o) => o.id)).toEqual(['auto', 'cpu-2']);
  });

  it('times each NPU and GPU backend the phone offers on its own, between automatic and the CPU', () => {
    expect(tuneOptions(8, 4, ['htp', 'opencl']).map((o) => o.id)).toEqual(['auto', 'htp', 'opencl', 'cpu-4', 'cpu-3', 'cpu-6']);
    expect(tuneOptions(8, 4, ['vulkan'])[1]).toMatchObject({ id: 'vulkan', backend: 'vulkan', threads: 4 });
  });

  it('keeps the fastest, and with a near tie the one with fewer threads', () => {
    expect(pickBest([result('a', 4, 4.5), result('b', 6, 3.7), result('c', 8, 2.1)])?.option.id).toBe('a');
    expect(pickBest([result('a', 6, 4.6), result('b', 4, 4.5)])?.option.id).toBe('b');
    expect(pickBest([result('a', 6, 5.5), result('b', 4, 4.5)])?.option.id).toBe('a');
  });

  it('then tries the memory settings on the winner: other cache types and flash attention, but never a value already in use', () => {
    const base = { id: 'cpu-4', label: 'CPU, 4 threads', backend: 'cpu' as any, threads: 4 };
    const small = { fileSize: 1e9 };
    const opts = refineOptions(base, { cacheType: 'q4_0', flashAttn: true }, small);
    expect(opts.map((o) => o.extra)).toEqual([{ cacheType: 'f16' }, { cacheType: 'q8_0' }, { flashAttn: false, cacheType: 'f16' }]);
    expect(refineOptions(base, { cacheType: 'f16', flashAttn: false }, small).map((o) => o.extra)).toEqual([{ flashAttn: true }]);
    expect(refineOptions(base, { cacheType: 'q4_0', flashAttn: true }, { filePath: '/m/gemma-4-e2b.gguf' })).toEqual([]);
    expect(refineOptions({ ...base, backend: 'auto' as any }, { cacheType: 'q4_0', flashAttn: true })).toEqual([]);
    expect(refineOptions(base, { cacheType: 'q4_0', flashAttn: true }, { fileSize: 4e9 }).map((o) => o.extra)).toEqual([{ cacheType: 'q8_0' }]);
    expect(refineOptions({ ...base, backend: 'htp' as any }, { cacheType: 'q4_0', flashAttn: true })).toEqual([]);
  });

  it('ignores options that failed, and picks nothing when none worked', () => {
    expect(pickBest([result('a', 4, 9, 'out of memory'), result('b', 4, 2)])?.option.id).toBe('b');
    expect(pickBest([result('a', 4, 0, 'failed')])).toBeNull();
    expect(pickBest([])).toBeNull();
  });

  it('suggests tuning only for a local model that is slow on at least two replies and not tuned or dismissed', () => {
    const slow = { decode: 2.1, prefill: 0, outLen: 100, samples: 2 };
    const base = { modelId: 'm', speed: slow, tuned: false, dismissed: false };
    expect(shouldSuggestTuning(base)).toBe(true);
    expect(shouldSuggestTuning({ ...base, speed: { ...slow, samples: 1 } })).toBe(false);
    expect(shouldSuggestTuning({ ...base, speed: { ...slow, decode: 4.5 } })).toBe(false);
    expect(shouldSuggestTuning({ ...base, tuned: true })).toBe(false);
    expect(shouldSuggestTuning({ ...base, dismissed: true })).toBe(false);
    expect(shouldSuggestTuning({ ...base, modelId: null })).toBe(false);
  });

  it('offers the first speed test once, only after a reply, never over the slow-reply tip', () => {
    const speed = (decode: number, samples: number) => ({ decode, prefill: 0, outLen: 0, samples });
    const base = { modelId: 'm', tuned: false, dismissed: false };
    expect(shouldOfferFirstTest({ ...base, speed: speed(9, 1) })).toBe(true);
    expect(shouldOfferFirstTest({ ...base, speed: undefined })).toBe(false);
    expect(shouldOfferFirstTest({ ...base, speed: speed(9, 1), tuned: true })).toBe(false);
    expect(shouldOfferFirstTest({ ...base, speed: speed(9, 1), dismissed: true })).toBe(false);
    expect(shouldOfferFirstTest({ ...base, speed: speed(1.5, 3) })).toBe(false);
  });

  it('remembers an NPU or GPU winner for the model, and forgets it when a later test picks the CPU', () => {
    useTuned.getState().mark('m', 'htp');
    expect(useTuned.getState().accelerator.m).toBe('htp');
    useTuned.getState().mark('m');
    expect(useTuned.getState().accelerator.m).toBeUndefined();
  });
});
