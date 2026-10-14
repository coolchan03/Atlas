import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from './useTheme';
import type { ThemeColors, ThemeShadows } from './palettes';

/**
 * Creates memoized StyleSheet from a factory that receives theme colors & shadows.
 * Re-computes when the theme changes (light ↔ dark, palette, accent, font or text size).
 *
 * Usage:
 *   const styles = useThemedStyles(createStyles);
 *   ...
 *   const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({ ... });
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ThemeColors, shadows: ThemeShadows) => T,
): T {
  const { colors, shadows, typographyKey, densityScale } = useTheme();
  return useMemo(
    () => {
      const original = factory(colors, shadows);
      if (densityScale === 1) return StyleSheet.create(original);
      const compacted = Object.fromEntries(Object.entries(original).map(([name, value]) => {
        if (!value || typeof value !== 'object') return [name, value];
        const scaled = Object.fromEntries(Object.entries(value).map(([key, amount]) => [
          key, /^(padding|margin|gap$|rowGap$|columnGap$)/.test(key) && typeof amount === 'number'
            ? Math.round(amount * densityScale) : amount,
        ]));
        return [name, scaled];
      }));
      return StyleSheet.create(compacted as T);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- factory is a stable module-level function
    [colors, shadows, typographyKey, densityScale],
  );
}
