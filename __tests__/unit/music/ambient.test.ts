import { AMBIENT, makeAmbient } from '../../../src/music/ambient';

const RATE = 8000;
const crossings = (x: Int16Array) => { let c = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) c++; return c; };

describe('ambient sounds', () => {
  it.each(AMBIENT.map((a) => a.id))('%s is the right length, audible and not clipping', (kind) => {
    const x = makeAmbient(kind, 6, { seed: 7, rate: RATE });
    expect(x.length).toBe(6 * RATE);
    const peak = Math.max(...Array.from(x, Math.abs));
    expect(peak).toBeGreaterThan(10000);
    expect(peak).toBeLessThanOrEqual(32767);
  });

  it('is the same sound for the same seed and different for another', () => {
    expect(makeAmbient('rain', 3, { seed: 1, rate: RATE })).toEqual(makeAmbient('rain', 3, { seed: 1, rate: RATE }));
    expect(makeAmbient('rain', 3, { seed: 1, rate: RATE })).not.toEqual(makeAmbient('rain', 3, { seed: 2, rate: RATE }));
  });

  it('white noise is brighter than pink, and pink than brown (more zero crossings)', () => {
    const c = (k: 'white' | 'pink' | 'brown') => crossings(makeAmbient(k, 4, { seed: 3, rate: RATE }));
    expect(c('white')).toBeGreaterThan(c('pink'));
    expect(c('pink')).toBeGreaterThan(c('brown'));
  });

  it('loops without a jump: the last sample sits as near the first as neighbouring samples do', () => {
    for (const a of AMBIENT) {
      const x = makeAmbient(a.id, 6, { seed: 11, rate: RATE });
      let step = 0;
      for (let i = 1; i < 2000; i++) step = Math.max(step, Math.abs(x[i] - x[i - 1]));
      expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(Math.max(step * 1.5, 6000));
    }
  });
});
