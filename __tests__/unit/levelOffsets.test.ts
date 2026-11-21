import { flatOffsets } from '../../src/screens/compass/LevelView';

describe('UX-02 both circles move', () => {
  it('converge at level', () => {
    const o = flatOffsets(0, 0, 400);
    expect(o.a).toEqual({ dx: 0, dy: 0 }); expect(o.b).toEqual({ dx: 0, dy: 0 });
  });
  it.each([[5, 0], [0, 5], [4, -3], [-4, 3]])('both change and move opposite for (%d,%d)', (x, y) => {
    const o = flatOffsets(x, y, 400);
    expect(o.a.dx + o.b.dx).toBeCloseTo(0); expect(o.a.dy + o.b.dy).toBeCloseTo(0);
    expect(Math.abs(o.a.dx) + Math.abs(o.a.dy)).toBeGreaterThan(0);
    expect(Math.abs(o.b.dx) + Math.abs(o.b.dy)).toBeGreaterThan(0);
  });
  it('stays within the available room', () => {
    const o = flatOffsets(500, 500, 100);
    expect(Math.abs(o.b.dx)).toBeLessThanOrEqual(50);
  });
});
