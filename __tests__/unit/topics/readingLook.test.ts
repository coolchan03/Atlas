import { readingTextStyle } from '../../../src/theme/globalText';
import { readingLook } from '../../../src/topics/readingPrefs';

const appearance = { key: 'atlas:normal:standard', scale: 1, heading: 'serif', body: 'sans-serif' };
const where = (nested = false) => ({ appearance, nested });

describe('reading look', () => {
  it('changes nothing when every choice is the default', () => {
    expect(readingLook({ size: 'normal', spacing: 'normal', font: 'app' })).toBeNull();
  });

  it('scales size and line height together and applies the spacing', () => {
    const look = readingLook({ size: 'large', spacing: 'roomy', font: 'app' })!;
    expect(readingTextStyle({ fontSize: 16, lineHeight: 24 }, look, where())).toEqual({ fontSize: 18, lineHeight: Math.round(24 * 1.15 * 1.2) });
  });

  it('gives a text with no line height one when the spacing is changed, but not a nested text', () => {
    const look = readingLook({ size: 'normal', spacing: 'roomy', font: 'app' })!;
    expect(readingTextStyle({ fontSize: 10 }, look, where())).toEqual({ fontSize: 10, lineHeight: Math.round(10 * 1.4 * 1.2) });
    expect(readingTextStyle({ fontSize: 10 }, look, where(true))).toEqual({ fontSize: 10 });
  });

  it('uses the reading font for text in the app font, and leaves icons and code alone', () => {
    const look = readingLook({ size: 'large', spacing: 'normal', font: 'book' })!;
    expect(look.family).toBeTruthy();
    expect((readingTextStyle({ fontFamily: 'sans-serif', fontSize: 10 }, look, where()) as any).fontFamily).toBe(look.family);
    expect((readingTextStyle({ fontSize: 10 }, look, where()) as any).fontFamily).toBe(look.family);
    expect(readingTextStyle({ fontFamily: 'Feather', fontSize: 14 }, look, where())).toEqual({ fontFamily: 'Feather', fontSize: 14 });
  });
});
