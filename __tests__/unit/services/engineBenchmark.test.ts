import { compareEngines, type EngineRun } from '../../../src/services/engineBenchmark';

const run = (o: Partial<EngineRun> = {}): EngineRun => ({
  engine: 'llama.rn', device: 'phone', model: 'm.gguf', quant: 'Q4_0', contextLength: 4096, prefillTps: 100, decodeTps: 10, coldLoadSec: 8, firstTokenSec: 1,
  peakRamMB: 3000, runs: 5, features: { vision: true, tools: true, mtp: true, qLegacy: true }, licenceOk: true, ...o,
});

describe('engine benchmark verdicts', () => {
  it('replaces only when faster on the same setup with nothing lost', () => {
    const r = compareEngines(run(), run({ engine: 'geniex', decodeTps: 20, prefillTps: 300 }));
    expect(r.verdict).toBe('replace');
    expect(r.speedup).toEqual({ decode: 2, prefill: 3 });
  });
  it('keeps the current engine when a feature is lost, memory balloons, the licence is unconfirmed, or it is not clearly faster', () => {
    expect(compareEngines(run(), run({ decodeTps: 40, features: { vision: false, tools: true, mtp: true, qLegacy: true } })).reasons.join(' ')).toMatch(/vision/);
    expect(compareEngines(run(), run({ decodeTps: 40, peakRamMB: 6000 })).verdict).toBe('keep');
    expect(compareEngines(run(), run({ decodeTps: 40, licenceOk: false })).reasons.join(' ')).toMatch(/Licence/);
    expect(compareEngines(run(), run({ decodeTps: 11 })).reasons.join(' ')).toMatch(/Not clearly faster/);
  });
  it('refuses to compare different phones, models or quantizations, and samples of fewer than five replies', () => {
    expect(compareEngines(run(), run({ quant: 'Q8_0', decodeTps: 99 })).verdict).toBe('not-comparable');
    expect(compareEngines(run(), run({ device: 'other' })).verdict).toBe('not-comparable');
    expect(compareEngines(run(), run({ runs: 2, decodeTps: 99 })).verdict).toBe('need-more-runs');
  });
});
