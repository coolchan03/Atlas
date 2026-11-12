import { clampLevelMarker, levelReading } from '../../../src/atlasTools/levelMath';
describe('compass level maths', () => {
  it('does not claim to be level without a valid sensor reading', () => {
    expect(levelReading(null)).toBeNull();
    expect(levelReading({ pitch: NaN, roll: 0 })).toBeNull();
  });
  it('computes a flat reading and large tilts', () => {
    expect(levelReading({ pitch: 0, roll: 0 })?.isLevel).toBe(true);
    expect(levelReading({ pitch: 3, roll: 4 })?.tilt).toBe(5);
    expect(levelReading({ pitch: 3, roll: 4 })?.isLevel).toBe(false);
  });
  it('constrains the marker inside the level', () => {
    expect(clampLevelMarker(0)).toBe(0);
    expect(clampLevelMarker(50)).toBe(90);
    expect(clampLevelMarker(-50)).toBe(-90);
  });
});
