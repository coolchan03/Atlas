import { layerOptions, mtpOptions, pickBest, refineOptions, tuneOptions, wholeReplySpeed, type TuneResult } from '../../../src/services/deviceTuner';
import { shouldOfferFirstTest, shouldSuggestTuning, useTuned, withModelMemory } from '../../../src/atlasTools/speed';

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

  it('applies what a model kept to that model only, and only while the setting the person chose has not changed since', () => {
    useTuned.getState().setMemory('m1', { cacheType: 'f16', nBatch: 1024, from: { cacheType: 'q4_0', nBatch: 512 } });
    expect(withModelMemory({ cacheType: 'q4_0', nBatch: 512, flashAttn: true }, 'm1')).toEqual({ cacheType: 'f16', nBatch: 1024, flashAttn: true });
    expect(withModelMemory({ cacheType: 'q4_0', nBatch: 512 }, 'other').cacheType).toBe('q4_0');
    // The person picked a cheaper cache afterwards: their choice wins for the cache, the saved batch size still applies.
    expect(withModelMemory({ cacheType: 'q8_0', nBatch: 512 }, 'm1')).toEqual({ cacheType: 'q8_0', nBatch: 1024 });
    useTuned.getState().setMemory('m1', undefined);
  });

  it('tries fewer, more and all GPU layers for an accelerated winner (never the count already in use), and nothing for the CPU', () => {
    const npu = { id: 'htp', label: 'NPU', backend: 'htp' as any, threads: 6 };
    expect(layerOptions(npu, 20).map((o) => o.extra)).toEqual([{ gpuLayers: 10 }, { gpuLayers: 30 }, { gpuLayers: 99 }]);
    expect(layerOptions(npu, 99).map((o) => o.extra?.gpuLayers)).toEqual([50]); // 99 already means all, so "more" and "all" are not tried again
    expect(layerOptions({ ...npu, backend: 'cpu' as any }, 20)).toEqual([]);
    expect(layerOptions({ ...npu, backend: 'auto' as any }, 20)).toEqual([]);
  });

  it('tries the model\'s built-in MTP drafting once, only when its metadata shows MTP layers, it has no draft file and is not marked as having them', () => {
    const base = { id: 'cpu-6', label: 'CPU', backend: 'cpu' as any, threads: 6 };
    expect(mtpOptions(base, { engine: 'llama' }, 1).map((o) => o.extra)).toEqual([{ mtp: true }]);
    expect(mtpOptions(base, { engine: 'llama' }, 3).map((o) => o.extra)).toEqual([{ mtp: true }]);
    expect(mtpOptions(base, { engine: 'llama', draftPath: '/m/draft.gguf' }, 1)).toEqual([]);
    expect(mtpOptions(base, { engine: 'llama', embeddedMtp: true }, 1)).toEqual([]);
    expect(mtpOptions(base, { engine: 'litert' }, 1)).toEqual([]);
  });

  it('never loads built-in MTP to test it on a model whose file has no MTP layers, or whose layers are unknown', () => {
    const base = { id: 'cpu-6', label: 'CPU', backend: 'cpu' as any, threads: 6 };
    expect(mtpOptions(base, { engine: 'llama' }, 0)).toEqual([]); // the file says none
    expect(mtpOptions(base, { engine: 'llama' }, null)).toEqual([]); // could not be read: not assumed
    expect(mtpOptions(base, { engine: 'llama' })).toEqual([]);
  });
});

describe('ranking by the whole reply', () => {
  const opt = (id: string, threads = 4) => ({ id, label: id, backend: 'cpu', threads } as any);

  it('prefers the option that finishes a typical reply sooner, even when another writes faster', () => {
    const fastWriterSlowStart = { option: opt('npu'), tps: 20, firstWordSec: 12 }; // 150 tokens: 12 + 7.5 = 19.5 s
    const slowWriterQuickStart = { option: opt('cpu'), tps: 12, firstWordSec: 1 };  // 150 tokens: 1 + 12.5 = 13.5 s
    expect(pickBest([fastWriterSlowStart, slowWriterQuickStart]).option.id).toBe('cpu');
  });

  it('is the writing speed when no first-word time was recorded, so older results rank as before', () => {
    expect(wholeReplySpeed({ tps: 9, firstWordSec: 0 })).toBe(9);
    expect(pickBest([{ option: opt('a'), tps: 5, firstWordSec: 0 }, { option: opt('b'), tps: 9, firstWordSec: 0 }]).option.id).toBe('b');
  });

  it('gives a failed option nothing', () => {
    expect(wholeReplySpeed({ tps: 0, firstWordSec: 3 })).toBe(0);
  });
});
