import { median, rejectOutliers, robustValue, relativeSpread, tieBand } from '../../../src/services/tuneStats';
import { embeddedMtpLayers } from '../../../src/services/gpuOffload';
import { mergeResults, contendersToConfirm, refinementToConfirm, batchesToConfirm, pickBest, type TuneResult } from '../../../src/services/deviceTuner';

const r = (id: string, tps: number, extra?: any, firstWordSec = 1, threads = 4): TuneResult =>
  ({ option: { id, label: id, backend: 'cpu' as any, threads, ...(extra ? { extra } : {}) }, tps, firstWordSec, samples: [tps], firstWords: [firstWordSec] });

describe('robust statistics', () => {
  it('median of odd and even sets', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it('removes an obvious outlier but never a value in a tight cluster', () => {
    expect(rejectOutliers([4.0, 4.1, 5.6])).toEqual([4.0, 4.1]);
    expect(rejectOutliers([5.0, 5.05, 5.1, 5.08])).toEqual([5.0, 5.05, 5.1, 5.08]);
    expect(rejectOutliers([4, 9])).toEqual([4, 9]); // two values: nothing can be called an outlier
  });
  it('the value is the median of what is left', () => {
    expect(robustValue([4.0, 4.1, 5.6])).toBeCloseTo(4.05, 5);
    expect(robustValue([2, 100, 2.2, 2.1])).toBeCloseTo(2.1, 5); // 100 removed: the middle of 2, 2.1, 2.2
  });
  it('spread is zero for one timing and grows with disagreement', () => {
    expect(relativeSpread([5])).toBe(0);
    expect(relativeSpread([5.0, 5.1])).toBeCloseTo(0.02, 2);
    expect(relativeSpread([4, 6])).toBeCloseTo(0.4, 2);
  });
  it('the tie band is at least 5%, follows the noise, and never exceeds 15%', () => {
    expect(tieBand(0)).toBe(0.05);
    expect(tieBand(0.1)).toBe(0.1);
    expect(tieBand(0.6)).toBe(0.15);
  });
});

describe('merging repeated timings', () => {
  it('uses the median of all samples with the outlier removed', () => {
    const merged = mergeResults(mergeResults(r('a', 5.6), r('a', 4.0)), r('a', 4.1));
    expect(merged.samples).toEqual([5.6, 4.0, 4.1]);
    expect(merged.tps).toBeCloseTo(4.05, 5);
    expect(merged.spread).toBeGreaterThan(0);
  });
  it('merges the first-word delays too', () => {
    expect(mergeResults(r('a', 5, undefined, 2), r('a', 5, undefined, 4)).firstWordSec).toBe(3);
  });
  it('a failed timing never replaces a good one, and two failures stay failed', () => {
    const good = r('a', 5);
    const bad: TuneResult = { ...r('a', 0), error: 'out of memory' };
    expect(mergeResults(good, bad)).toBe(good);
    expect(mergeResults(bad, good)).toBe(good);
    expect(mergeResults(bad, bad).error).toBe('out of memory');
  });
});

describe('what is timed again', () => {
  it('only the top two when they are within noise of each other, and none when there is a clear winner', () => {
    expect(contendersToConfirm([r('a', 5.6), r('b', 5.0), r('c', 4.9), r('d', 4.8)]).map((x) => x.option.id)).toEqual(['a', 'b']);
    expect(contendersToConfirm([r('a', 8), r('b', 4), r('c', 3)])).toEqual([]);
    expect(contendersToConfirm([r('a', 5)])).toEqual([]);
    expect(contendersToConfirm([r('a', 5), { ...r('b', 5), error: 'x' }])).toEqual([]);
  });

  it('a memory refinement is re-checked only when one timing would adopt it and noise could explain the gain', () => {
    const first = r('cpu-4', 5);
    expect(refinementToConfirm(first, [first, r('cpu-4+cache-q8_0', 5.5, { cacheType: 'q8_0' })]).map((x) => x.option.id)).toEqual(['cpu-4', 'cpu-4+cache-q8_0']);
    expect(refinementToConfirm(first, [first, r('cpu-4+cache-q8_0', 5.3, { cacheType: 'q8_0' })])).toEqual([]); // 6% on one timing would not be adopted anyway
    expect(refinementToConfirm(first, [first, r('cpu-4+cache-q8_0', 8, { cacheType: 'q8_0' })])).toEqual([]); // clearly better
    expect(refinementToConfirm(first, [first, r('cpu-4+cache-q8_0', 2, { cacheType: 'q8_0' })])).toEqual([]); // clearly worse
    expect(refinementToConfirm(null, [])).toEqual([]);
  });

  it('a batch size is re-checked only when its gain on the long prompt would be adopted but is small enough to be noise', () => {
    const now = r('x+batch-now', 5, undefined, 20);
    expect(batchesToConfirm([now, r('x+batch-1024', 5, undefined, 17)]).map((x) => x.option.id)).toEqual(['x+batch-now', 'x+batch-1024']);
    expect(batchesToConfirm([now, r('x+batch-1024', 5, undefined, 10)])).toEqual([]); // 2x faster: believed
    expect(batchesToConfirm([now, r('x+batch-1024', 5, undefined, 19.5)])).toEqual([]); // 3% faster would not be adopted anyway
    expect(batchesToConfirm([now])).toEqual([]);
  });

  it('a noisy high reading no longer beats a steadier, truly faster option once both are timed again', () => {
    // cpu-6 read 5.6 once by luck (really about 4.1); cpu-4 really is about 5.0
    const noisy = mergeResults(mergeResults(r('cpu-6', 5.6, undefined, 1, 6), r('cpu-6', 4.0, undefined, 1, 6)), r('cpu-6', 4.1, undefined, 1, 6));
    const steady = mergeResults(r('cpu-4', 5.0), r('cpu-4', 5.1));
    expect(pickBest([r('cpu-6', 5.6, undefined, 1, 6), r('cpu-4', 5.0)])?.option.id).toBe('cpu-6'); // the old single-run choice
    expect(pickBest([noisy, steady])?.option.id).toBe('cpu-4');
  });

  it('a wider tie band applies when the fastest option itself was noisy', () => {
    const noisyTop = { ...r('a', 5.0, undefined, 1, 6), spread: 0.12 };
    expect(pickBest([noisyTop, r('b', 4.5, undefined, 1, 4)])?.option.id).toBe('b'); // 10% apart is inside 12% noise: the cooler setting wins
    expect(pickBest([r('a', 5.0, undefined, 1, 6), r('b', 4.5, undefined, 1, 4)])?.option.id).toBe('a'); // with no noise seen, 10% is a real gap
  });
});

describe('embeddedMtpLayers reads the model file, not its name', () => {
  it('counts the MTP layers in the metadata', () => {
    expect(embeddedMtpLayers({ 'general.architecture': 'qwen35', 'qwen35.nextn_predict_layers': 1 })).toBe(1);
    expect(embeddedMtpLayers({ 'glm4moe.nextn_predict_layers': '3' })).toBe(3);
  });
  it('a model with metadata but no MTP key has none, whatever it is called', () => {
    expect(embeddedMtpLayers({ 'general.architecture': 'qwen35', 'general.name': 'Qwen3.5-MTP-GGUF' })).toBe(0);
    expect(embeddedMtpLayers({ 'general.architecture': 'llama', 'llama.nextn_predict_layers': 0 })).toBe(0);
  });
  it('unreadable metadata is unknown, not "none"', () => {
    expect(embeddedMtpLayers(undefined)).toBeNull();
    expect(embeddedMtpLayers(null)).toBeNull();
    expect(embeddedMtpLayers({})).toBeNull();
  });
});
