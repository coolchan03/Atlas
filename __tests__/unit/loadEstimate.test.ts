import { describeEstimate, estimateTextLoad, loadAlternatives } from '../../src/services/loadEstimate';

const GB = 1024 ** 3;
describe('UX-12 load estimate', () => {
  it('adds conversation memory that grows with the context, and the projector', () => {
    const small = estimateTextLoad({ fileSizeBytes: 2.5 * GB, contextLength: 2048, overheadMultiplier: 1.2 });
    const big = estimateTextLoad({ fileSizeBytes: 2.5 * GB, contextLength: 16384, overheadMultiplier: 1.2, mmProjBytes: 0.6 * GB });
    expect(big.kvGB).toBeGreaterThan(small.kvGB * 7);
    expect(big.projectorGB).toBeCloseTo(0.6, 1);
    expect(big.totalGB).toBeGreaterThan(small.totalGB + 1);
    expect(small.kvGB).toBeCloseTo(0.31, 1); // about 0.15 MB per token for a 2.5 GB model
  });
  it('always gives a range and says it is an estimate', () => {
    const e = estimateTextLoad({ fileSizeBytes: 4 * GB, contextLength: 8192, overheadMultiplier: 1.3 });
    expect(e.lowGB).toBeLessThan(e.totalGB); expect(e.highGB).toBeGreaterThan(e.totalGB);
    expect(describeEstimate(e)).toMatch(/estimate from the file size, not a guarantee/);
  });
  it('offers a smaller context only when it would actually fit, plus other choices, and nothing when it fits', () => {
    const e = estimateTextLoad({ fileSizeBytes: 3 * GB, contextLength: 16384, overheadMultiplier: 1.2 });
    const tight = loadAlternatives(e, e.weightsGB + e.overheadGB + e.kvGB * 0.3);
    expect(tight.join(' ')).toMatch(/Lower the context size to (8192|4096) tokens/);
    expect(tight.join(' ')).toMatch(/smaller or more compressed/);
    expect(loadAlternatives(e, 100)).toEqual([]);
    expect(loadAlternatives(e, 1).join(' ')).not.toMatch(/Lower the context/); // no context size would fit: do not pretend
  });
  it('does not break on a missing size', () => {
    expect(estimateTextLoad({ fileSizeBytes: 0, contextLength: 4096, overheadMultiplier: 1.2 }).totalGB).toBe(0);
  });
});
