import { readableOn } from '../../../src/theme/colorSafety';
import { getTheme } from '../../../src/theme/useTheme';

describe('text on the accent colour', () => {
  it('is light on a dark accent and dark on a bright one', () => {
    expect(readableOn('#B3620F')).toBe('#FFFFFF');
    expect(readableOn('#F2A93B')).toBe('#1D1A16');
  });
  it('follows the theme, so selected chips are readable in dark mode', () => {
    expect(getTheme('light').colors.onPrimary).toBe('#FFFFFF');
    expect(getTheme('dark').colors.onPrimary).toBe('#1D1A16');
  });
});
