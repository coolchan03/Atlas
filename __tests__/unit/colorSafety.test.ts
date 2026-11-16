import { safeColor, sanitizeChanged, withAlpha } from '../../src/theme/colorSafety';
import { getTheme } from '../../src/theme/useTheme';
import { COLORS_DARK, COLORS_LIGHT } from '../../src/theme/palettes';

describe('colours from the person are made safe', () => {
  it('keeps a 6-digit colour, expands a short one and drops a see-through part, and refuses anything else', () => {
    expect(safeColor('#1A2B3C', '#000000')).toBe('#1A2B3C');
    expect(safeColor('#abc', '#000000')).toBe('#aabbcc');
    expect(safeColor('#abcd', '#000000')).toBe('#aabbcc');
    expect(safeColor('#112233CC', '#000000')).toBe('#112233');
    for (const bad of ['red', 'rgb(1,2,3)', '#12345', '#gg0000', '', undefined, 42, null]) expect(safeColor(bad, '#123456')).toBe('#123456');
  });

  it('only changes what the appearance changed, and puts back the original for a bad value', () => {
    const base = { a: '#111111', b: '#222222', c: 'rgba(0,0,0,0.5)' };
    expect(sanitizeChanged({ a: '#333', b: '#222222', c: 'rgba(0,0,0,0.5)' }, base)).toEqual({ a: '#333333', b: '#222222', c: 'rgba(0,0,0,0.5)' });
    expect(sanitizeChanged({ a: 'banana', b: '#222222', c: 'x' }, base)).toEqual({ a: '#111111', b: '#222222', c: 'x' });
  });

  it('makes a see-through shade that is always valid, and leaves a see-through colour see-through', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(withAlpha('#f00', 0.2)).toBe('rgba(255, 0, 0, 0.2)');
    expect(withAlpha('transparent', 0.5)).toBe('transparent');
  });
});

describe('a theme with odd colours still draws', () => {
  const HEX6 = /^#[0-9a-f]{6}$/i;
  it('turns short, long and invalid custom colours into usable ones for both modes', () => {
    const appearance: any = { custom: { name: 'x', light: { primary: '#f0a', surface: '#11223344', text: 'purple' }, dark: { primary: '#0af', border: 'not a colour' } } };
    const light = getTheme('light', appearance).colors;
    expect(light.primary).toBe('#ff00aa');
    expect(light.surface).toBe('#112233');
    expect(light.text).toBe(COLORS_LIGHT.text);
    const dark = getTheme('dark', appearance).colors;
    expect(dark.primary).toBe('#00aaff');
    expect(dark.border).toBe(COLORS_DARK.border);
    // Every colour the app adds two digits to is a valid hex colour, so `${colors.primary}44` is always a colour.
    for (const k of ['primary', 'surface', 'background', 'border', 'success', 'warning', 'info'] as const) expect(`${light[k]}`).toMatch(HEX6);
  });
});
