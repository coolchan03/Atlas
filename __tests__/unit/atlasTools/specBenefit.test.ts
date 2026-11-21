import { describeSpec, MIN_SAMPLES, RETRY_AFTER_MS, specVerdict, useSpecBenefit } from '../../../src/atlasTools/specBenefit';
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

describe('leaving speculative decoding off when it is slower', () => {
  const slow = () => ({ on: { decode: 3, samples: 4 }, off: { decode: 5, samples: 4 } });
  beforeEach(() => useSpecBenefit.setState({ byModel: {} }));

  it('leaves it off while it is measured slower, and tries it again after two weeks with fresh measurements', () => {
    useSpecBenefit.setState({ byModel: { m: slow() } });
    const t0 = 1_000_000;
    expect(useSpecBenefit.getState().decide('m', t0)).toMatchObject({ off: true, note: expect.stringContaining('40% slower') });
    expect(useSpecBenefit.getState().decide('m', t0 + RETRY_AFTER_MS - 1).off).toBe(true);
    expect(useSpecBenefit.getState().decide('m', t0 + RETRY_AFTER_MS).off).toBe(false); // tried again
    expect(useSpecBenefit.getState().byModel.m.on.samples).toBe(0); // the old verdict does not decide twice
    expect(useSpecBenefit.getState().byModel.m.off.samples).toBe(4);
  });

  it('does nothing for a model that is not slower, or has too little measured', () => {
    useSpecBenefit.setState({ byModel: { fast: { on: { decode: 8, samples: 5 }, off: { decode: 5, samples: 5 } }, few: { on: { decode: 1, samples: 1 }, off: { decode: 5, samples: 5 } } } });
    expect(useSpecBenefit.getState().decide('fast').off).toBe(false);
    expect(useSpecBenefit.getState().decide('few').off).toBe(false);
    expect(useSpecBenefit.getState().decide('unknown').off).toBe(false);
  });

  it('starts over when the person switches MTP on by hand', async () => {
    useSpecBenefit.setState({ byModel: { m: slow() } });
    const { modelManager } = require('../../../src/services/modelManager');
    jest.spyOn(modelManager as any, 'changeLlama').mockResolvedValue(undefined);
    await modelManager.setAttachmentEnabled('m', 'draft', true);
    expect(useSpecBenefit.getState().byModel.m).toBeUndefined();
  });
});
