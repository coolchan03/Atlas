import { heightFromPressure, pressureTrend, seaLevelPressure, type PressureSample } from '../../../src/atlasTools/pressureTrend';

const H = 3_600_000;
const NOW = 10 * H;
/** Readings every 20 minutes for `hours`, the pressure going from `from` to `to` in a straight line. */
const run = (hours: number, from: number, to: number, gps?: (i: number) => number | undefined): PressureSample[] => {
  const n = Math.round(hours * 3);
  return Array.from({ length: n + 1 }, (_, i) => ({ at: NOW - hours * H + (i * hours * H) / n, hpa: from + ((to - from) * i) / n, gpsM: gps?.(i) }));
};

describe('pressure trend', () => {
  it('needs about 45 minutes of readings before it says anything', () => {
    expect(pressureTrend(run(0.5, 1010, 1009), NOW)).toBeNull();
    expect(pressureTrend([], NOW)).toBeNull();
  });
  it('calls a drop of 3 hPa over 3 hours falling, and warns that the weather may turn', () => {
    const t = pressureTrend(run(3, 1012, 1009, () => 200), NOW)!;
    expect(t.label).toBe('falling');
    expect(t.change3h).toBeCloseTo(-3, 0);
    expect(t.hint).toMatch(/weather may be turning/);
  });
  it('calls a big drop fast, and a rise a clearing', () => {
    expect(pressureTrend(run(3, 1015, 1010, () => 50), NOW)!.label).toBe('falling fast');
    expect(pressureTrend(run(3, 1012, 1019, () => 50), NOW)!.label).toBe('rising fast');
    expect(pressureTrend(run(3, 1010, 1012, () => 50), NOW)!.label).toBe('rising');
  });
  it('says steady, with no warning, when pressure barely moves', () => {
    const t = pressureTrend(run(3, 1012, 1011.6, () => 50), NOW)!;
    expect(t.label).toBe('steady');
    expect(t.hint).toBe('');
  });
  it('takes your own climbing out: a drop that is only a 100 m climb is not a storm', () => {
    // Climbing 100 m lowers the pressure by about 12 hPa at the same weather.
    const climb = (i: number) => 100 + i * (100 / 9);
    const samples = run(3, 1000, 1000 - 12, climb);
    const t = pressureTrend(samples, NOW)!;
    expect(t.adjusted).toBe(true);
    expect(['steady', 'rising', 'falling']).toContain(t.label); // no longer 'falling very fast'
    expect(t.label).not.toBe('falling very fast');
  });
  it('without GPS, a pressure change as big as a climb is not called weather', () => {
    const t = pressureTrend(run(3, 1000, 970), NOW)!;
    expect(t.heightChanged).toBe(true);
    expect(t.hint).toMatch(/no GPS height/);
  });
  it('converts between pressure and height with the standard atmosphere', () => {
    expect(heightFromPressure(1013.25)).toBeCloseTo(0, 0);
    expect(heightFromPressure(899)).toBeGreaterThan(900);
    expect(heightFromPressure(899)).toBeLessThan(1050);
    expect(seaLevelPressure(899, heightFromPressure(899))).toBeCloseTo(1013.25, 0);
  });
});
