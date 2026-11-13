import { TILE } from '../../src/theme/tilePalette';
import { readFileSync } from 'fs';

describe('FULL-04 Home tile colours come from one palette', () => {
  it('every tile palette has a tint, a dark tint and two accents', () => {
    for (const [name, c] of Object.entries(TILE)) {
      expect([name, /^#[0-9A-F]{6}$/i.test(c.tint) && /^#[0-9A-F]{6}$/i.test(c.tintDark) && c.color.every((x) => /^#[0-9A-F]{6}$/i.test(x))]).toEqual([name, true]);
    }
  });
  it('QuickHome keeps no tile colour literals of its own', () => {
    const src = readFileSync(require.resolve('../../src/screens/HomeScreen/QuickHome.tsx'), 'utf8');
    expect(src.match(/tint: '#/g) ?? []).toHaveLength(0);
    expect(src.match(/color: \['#/g) ?? []).toHaveLength(0);
  });
});
