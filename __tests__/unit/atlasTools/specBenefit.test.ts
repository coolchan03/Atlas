import { describeSpec, MIN_SAMPLES, specVerdict, useSpecBenefit } from '../../../src/atlasTools/specBenefit';
import { recordLlamaTimings } from '../../../src/atlasTools/speedHooks';
import { useAppStore } from '../../../src/stores/appStore';
import { runtimeLine } from '../../../src/components/models/ModelAttachments';

const side = (decode: number, samples: number) => ({ decode, samples });

describe('speculative decoding benefit', () => {
  beforeEach(() => useSpecBenefit.setState({ byModel: {} }));

  it('says nothing until each side has enough replies', () => {
    expect(specVerdict(undefined)).toEqual({ kind: 'unknown' });
    expect(specVerdict({ on: side(10, MIN_SAMPLES), off: side(5, MIN_SAMPLES - 1) })).toEqual({ kind: 'unknown' });
  });

  it('compares writing speed with it and without it', () => {
    expect(specVerdict({ on: side(7.5, 4), off: side(5, 4) })).toEqual({ kind: 'helps', percent: 50 });
    expect(specVerdict({ on: side(4, 4), off: side(5, 4) })).toEqual({ kind: 'hurts', percent: 20 });
    expect(specVerdict({ on: side(5.2, 4), off: side(5, 4) }).kind).toBe('same');
  });

  it('is learned from real replies, tagged by whether it was running, and ignores short replies and impossible speeds', () => {
    useAppStore.setState({ activeModelId: 'gemma' });
    const reply = (drafting: boolean, perSecond: number, n = 80) => recordLlamaTimings({ timings: { predicted_per_second: perSecond, predicted_n: n } }, undefined, drafting);
    for (let i = 0; i < 3; i++) { reply(false, 5); reply(true, 8); }
    reply(true, 99, 10); // too short to time
    reply(true, 99999); // not a speed
    expect(useSpecBenefit.getState().byModel.gemma.on.samples).toBe(3);
    expect(describeSpec('gemma')).toBe('Measured on this phone: replies are written about 60% faster with it.');
  });

  it('is written onto the MTP row of the model card, and not onto the picture row', () => {
    const report: any = { vision: { loaded: true, estimatedMB: 100 }, mtp: { loaded: true, estimatedMB: 0, kind: 'embedded' } };
    expect(runtimeLine('draft' as any, report, 'Measured on this phone: no clear difference in speed with it.')).toBe('Running now. Measured on this phone: no clear difference in speed with it.');
    expect(runtimeLine('vision', report, 'ignored')).toBe('Running now, using about 100 MB.');
    expect(runtimeLine('draft' as any, report)).toBe('Running now.');
  });
});
