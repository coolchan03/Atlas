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
  const { colors, shadows, typographyKey } = useTheme();
  return useMemo(
    () => StyleSheet.create(factory(colors, shadows)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- factory is a stable module-level function
    [colors, shadows, typographyKey],
  );
}
