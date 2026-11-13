import { reshapeStyle } from '../../src/theme/useThemedStyles';
import { SKINS, shapeOf, PALETTES, ACCENTS, FONT_CHOICES } from '../../src/theme/appearance';

const card = { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, padding: 8 };

describe('skins', () => {
  it('square corners and heavy borders for the retro desktop', () => {
    const out = reshapeStyle(card, shapeOf('retro'), '#00f');
    expect(out).toMatchObject({ borderRadius: 0, borderWidth: 2, padding: 8 });
    expect(out.shadowOpacity).toBeUndefined();
  });
  it('bigger corners for iOS and Material, and a soft shadow on boxes for Aero', () => {
    expect(reshapeStyle(card, shapeOf('ios'), '#00f').borderRadius).toBe(18);
    expect(reshapeStyle(card, shapeOf('material'), '#00f').borderRadius).toBe(24);
    expect(reshapeStyle(card, shapeOf('aero'), '#00f')).toMatchObject({ shadowOpacity: 0.2, elevation: 3, borderRadius: 17 });
  });
  it('a glow in the accent color for neon, only on boxes, not on text or small chips', () => {
    expect(reshapeStyle(card, shapeOf('neon'), '#ff00aa')).toMatchObject({ shadowColor: '#ff00aa', shadowOpacity: 0.7 });
    expect(reshapeStyle({ color: '#fff', fontSize: 14 }, shapeOf('neon'), '#ff00aa').shadowOpacity).toBeUndefined();
    expect(reshapeStyle({ backgroundColor: '#fff', borderRadius: 3 }, shapeOf('neon'), '#ff00aa').shadowOpacity).toBeUndefined();
  });
  it('leaves the standard look alone', () => {
    expect(reshapeStyle(card, shapeOf(undefined), '#00f')).toEqual(card);
  });
  it('every skin points at a palette, accent and font that exist', () => {
    for (const skin of SKINS) {
      expect(PALETTES.some((p) => p.id === skin.look.palette)).toBe(true);
      expect(ACCENTS.some((a) => a.id === skin.look.accent)).toBe(true);
      expect(FONT_CHOICES.some((f) => f.id === skin.look.font)).toBe(true);
    }
    expect(SKINS.map((s) => s.id)).toEqual(expect.arrayContaining(['aero', 'retro', 'ios', 'terminal', 'xp', 'mac']));
  });
});

describe('extra rounded preset (UX-04)', () => {
  const { reshapeStyle, pillRadius } = require('../../src/theme/useThemedStyles');
  const shape = { radius: 2, minBorder: 0, shadow: 'none', pill: true } as const;
  it('makes padded controls pills, square icon buttons circles, and keeps cards content-safe', () => {
    expect(reshapeStyle({ borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff' }, shape, '#0f0').borderRadius).toBe(999);
    expect(reshapeStyle({ borderRadius: 8, width: 44, height: 44 }, shape, '#0f0').borderRadius).toBe(22);
    expect(reshapeStyle({ borderRadius: 16, padding: 16, backgroundColor: '#fff' }, shape, '#0f0').borderRadius).toBe(32);
    expect(reshapeStyle({ borderRadius: 8, width: 120, height: 80 }, shape, '#0f0').borderRadius).toBe(16); // a thumbnail is not cropped into a pill
    expect(pillRadius({ padding: 12, height: 200 }, 8, 2)).toBe(16); // tall boxes stay boxes
  });
  it('does nothing without the preset, and an explicit numeric radius still wins', () => {
    expect(reshapeStyle({ borderRadius: 8, padding: 8 }, { radius: 1, minBorder: 0, shadow: 'none' }, '#0f0').borderRadius).toBe(8);
    const { getTheme } = require('../../src/theme/useTheme');
    expect(getTheme('light', { shapePreset: 'extra-rounded' }).shape).toMatchObject({ radius: 2, pill: true });
    expect(getTheme('light', { shapePreset: 'extra-rounded', cornerRadius: 0.5 }).shape.pill).toBeUndefined();
  });
});
