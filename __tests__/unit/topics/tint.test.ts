import { tint } from '../../../src/topics/tint';

describe('tint', () => {
  it('turns #rgb and #rrggbb into a see-through colour and leaves others alone', () => {
    expect(tint('#B3620F', 0.1)).toBe('rgba(179, 98, 15, 0.1)');
    expect(tint('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(tint('rgba(1, 2, 3, 1)', 0.5)).toBe('rgba(1, 2, 3, 1)');
  });
});
