import { measureEngine, roundsNeeded, type EngineHandle } from '../../../src/services/engineCompare';
import { compareEngines } from '../../../src/services/engineBenchmark';

const setup = { device: 'razr', model: 'm.gguf', quant: 'Q4_0', contextLength: 4096, features: { vision: false, tools: true, mtp: false, qLegacy: true }, licenceOk: true };
const handle = (engine: string, decode: number, extra: Partial<EngineHandle> = {}): EngineHandle & { calls: string[] } => {
  const calls: string[] = [];
  return { engine, calls, load: async () => { calls.push('load'); return 6; }, reply: async () => { calls.push('reply'); return { ttftSec: 0.8, prefillTps: decode * 8, decodeTps: decode }; }, peakRamMB: async () => 2500, unload: async () => { calls.push('unload'); }, ...extra };
};

describe('measuring an engine', () => {
  it('takes the median of real replies and always unloads', async () => {
    const h = handle('geniex', 20);
    const run = await measureEngine(h, setup, { prompts: ['a', 'b', 'c'], rounds: 2 });
    expect(run).toMatchObject({ engine: 'geniex', decodeTps: 20, prefillTps: 160, coldLoadSec: 6, firstTokenSec: 0.8, peakRamMB: 2500, runs: 6, quant: 'Q4_0' });
    expect(h.calls.filter((c) => c === 'reply')).toHaveLength(6);
    expect(h.calls[h.calls.length - 1]).toBe('unload');
  });
  it('unloads even when a reply fails, and rejects an engine that measures nothing', async () => {
    const h = handle('geniex', 20, { reply: async () => { throw new Error('npu error'); } });
    await expect(measureEngine(h, setup, { prompts: ['a'] })).rejects.toThrow('npu error');
    expect(h.calls).toContain('unload');
    await expect(measureEngine(handle('zero', 0), setup, { prompts: ['a'] })).rejects.toThrow(/no measurable reply/);
  });
  it('feeds the comparison rule: needs enough runs, then a clear win with nothing lost', async () => {
    const rn = await measureEngine(handle('llama.rn', 10), setup, { prompts: ['a'], rounds: roundsNeeded(1) });
    const gx = await measureEngine(handle('geniex', 24), setup, { prompts: ['a'], rounds: roundsNeeded(1) });
    expect(roundsNeeded(1)).toBe(5);
    expect(compareEngines(rn, gx).verdict).toBe('replace');
    const few = await measureEngine(handle('geniex', 24), setup, { prompts: ['a'], rounds: 1 });
    expect(compareEngines(rn, few).verdict).toBe('need-more-runs');
  });
});
