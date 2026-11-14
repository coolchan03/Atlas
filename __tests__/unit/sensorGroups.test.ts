import { axisBars, groupSensors, metaOf } from '../../src/sensors/sensorCatalog';

describe('sensor groups and bars', () => {
  it('puts sensors in their groups in a steady order and leaves empty groups out', () => {
    const groups = groupSensors([{ type: 1 }, { type: 5 }, { type: 2 }, { type: 999 }, { type: 19 }]);
    expect(groups.map((g) => g.id)).toEqual(['environment', 'motion', 'orientation', 'activity', 'other']);
    expect(groupSensors([{ type: 5 }]).map((g) => g.id)).toEqual(['environment']);
    expect(groupSensors([])).toEqual([]);
    expect(metaOf(999).icon).toBe('cpu');
  });

  it('turns x, y and z into bars between -1 and 1, clamping and ignoring bad numbers', () => {
    expect(axisBars(1, [10, -20, 40])).toEqual([{ axis: 'x', value: 10, fraction: 0.5 }, { axis: 'y', value: -20, fraction: -1 }, { axis: 'z', value: 40, fraction: 1 }]);
    expect(axisBars(1, [NaN, 0, 0])?.[0].fraction).toBe(0);
    expect(axisBars(5, [300])).toBeNull();
    expect(axisBars(1, undefined)).toBeNull();
    expect(axisBars(1, [1, 2])).toBeNull();
  });
});
