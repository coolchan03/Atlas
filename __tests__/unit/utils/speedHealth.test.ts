import { classifyDecodeSpeed, speedHealthLabel } from '../../../src/atlasTools/speed';

describe('decode speed health', () => {
  it('classifies unusable or missing measurements as unknown/slow appropriately', () => {
    expect(classifyDecodeSpeed(undefined)).toBe('unknown');
    expect(classifyDecodeSpeed(0)).toBe('unknown');
    expect(classifyDecodeSpeed(2.9)).toBe('slow');
  });

  it('uses the shared usability bands', () => {
    expect(classifyDecodeSpeed(3)).toBe('usable');
    expect(classifyDecodeSpeed(6.9)).toBe('usable');
    expect(classifyDecodeSpeed(7)).toBe('good');
    expect(classifyDecodeSpeed(19.9)).toBe('good');
    expect(classifyDecodeSpeed(20)).toBe('very-fast');
  });

  it('returns human readable labels', () => {
    expect(speedHealthLabel(2)).toBe('slow');
    expect(speedHealthLabel(5)).toBe('usable');
    expect(speedHealthLabel(10)).toBe('good');
    expect(speedHealthLabel(25)).toBe('very fast');
  });
});
