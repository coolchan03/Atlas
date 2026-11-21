import { clampRatio, dragRatio, MAX_RATIO, MIN_RATIO, paneDirection, ratioKey } from '../../src/hooks/paneRatio';

describe('UX-18 resizable panes', () => {
  it('stacks in a tall window and sits side by side in a wide one', () => {
    expect(paneDirection(1280, 800)).toBe('row');
    expect(paneDirection(800, 1280)).toBe('column');
  });
  it('keeps each pane usable', () => {
    expect(clampRatio(0.05)).toBe(MIN_RATIO); expect(clampRatio(0.99)).toBe(MAX_RATIO); expect(clampRatio(NaN)).toBe(0.5);
  });
  it('turns a drag into a ratio, and ignores a drag before the size is known', () => {
    expect(dragRatio(0.5, 100, 1000)).toBeCloseTo(0.6);
    expect(dragRatio(0.5, -900, 1000)).toBe(MIN_RATIO);
    expect(dragRatio(0.4, 50, 0)).toBe(0.4);
  });
  it('remembers a ratio for each window shape separately', () => {
    expect(ratioKey('expanded', 'row')).not.toBe(ratioKey('expanded', 'column'));
  });
});
