// Light and dark color palettes + shadow definitions

export type ThemeColors = typeof COLORS_LIGHT;

interface ShadowStyle {
  boxShadow: string;
}

export type ThemeShadows = {
  small: ShadowStyle;
  medium: ShadowStyle;
  large: ShadowStyle;
  glow: ShadowStyle;
};

// ── Light palette ──────────────────────────────────────────────────
export const COLORS_LIGHT = {
  // Primary accent
  primary: '#B3620F',
  primaryDark: '#8F4C08',
  primaryLight: '#D98E3A',

  // Backgrounds
  background: '#FBF8F2',
  surface: '#F3EDE1',
  surfaceLight: '#EAE2D2',
  surfaceHover: '#E1D7C4',

  // Text hierarchy
  text: '#1D1A16',
  textSecondary: '#5A534A',
  textMuted: '#8C8478',
  textDisabled: '#C4BBAD',

  // Borders
  border: '#E4DACA',
  borderLight: '#D6CAB5',
  borderFocus: '#B3620F',

  // Semantic colors
  success: '#4D7C0F',
  warning: '#1D1A16',
  error: '#DC2626',
  trending: '#D97706',
  errorBackground: 'rgba(220, 38, 38, 0.10)',
  info: '#5A534A',

  // Special
  overlay: 'rgba(0, 0, 0, 0.4)',
  divider: '#EAE2D2',
};

// ── Dark palette ───────────────────────────────────────────────────
export const COLORS_DARK = {
  // Primary accent
  primary: '#F2A93B',
  primaryDark: '#D98E1F',
  primaryLight: '#F8C56E',

  // Backgrounds
  background: '#0D1321',
  surface: '#151D2E',
  surfaceLight: '#1C2639',
  surfaceHover: '#243049',

  // Text hierarchy
  text: '#F4EFE6',
  textSecondary: '#B7B2A8',
  textMuted: '#857F75',
  textDisabled: '#4A4F5C',

  // Borders
  border: '#222C40',
  borderLight: '#2C3850',
  borderFocus: '#F2A93B',

  // Semantic colors
  success: '#A3C76B',
  warning: '#F4EFE6',
  error: '#C75050',
  trending: '#F59E0B',
  errorBackground: 'rgba(239, 68, 68, 0.15)',
  info: '#B7B2A8',

  // Special
  overlay: 'rgba(5, 8, 15, 0.75)',
  divider: '#1A2335',
};

// ── Light shadows ────────────────────────────────────────────────────
// Uses CSS boxShadow (RN 0.76+ with New Architecture) for cross-platform
// shadow rendering. Works identically on iOS and Android.
export const SHADOWS_LIGHT: ThemeShadows = {
  small: {
    boxShadow: '0px 1px 8px 0px rgba(0,0,0,0.18)',
  },
  medium: {
    boxShadow: '0px 2px 10px 0px rgba(0,0,0,0.22)',
  },
  large: {
    boxShadow: '0px 4px 18px 0px rgba(0,0,0,0.35)',
  },
  glow: {
    boxShadow: '0px 0px 12px 0px rgba(179,98,15,0.25)',
  },
};

// ── Dark shadows (crisp white glow for depth) ───────────────────────
export const SHADOWS_DARK: ThemeShadows = {
  small: {
    boxShadow: '0px 0px 6px 0px rgba(255,255,255,0.18)',
  },
  medium: {
    boxShadow: '0px 0px 6px 0px rgba(255,255,255,0.20)',
  },
  large: {
    boxShadow: '0px 0px 10px 0px rgba(255,255,255,0.25)',
  },
  glow: {
    boxShadow: '0px 0px 8px 0px rgba(242,169,59,0.30)',
  },
};

// ── Elevation factory ──────────────────────────────────────────────
export function createElevation(colors: ThemeColors) {
  return {
    level0: {
      backgroundColor: colors.background,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    level1: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    level2: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    level3: {
      backgroundColor: `${colors.surface}F2`,
      borderTopWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 16,
      blur: {
        ios: { blurAmount: 10, blurType: colors.background === '#0D1321' ? 'dark' : 'light' },
        android: { overlayColor: colors.overlay },
      },
    },
    level4: {
      backgroundColor: `${colors.surface}FA`,
      borderTopWidth: 1,
      borderColor: colors.primary,
      borderRadius: 16,
      blur: {
        ios: { blurAmount: 15, blurType: colors.background === '#0D1321' ? 'dark' : 'light' },
        android: { overlayColor: colors.overlay },
      },
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.textMuted,
      borderRadius: 2,
      alignSelf: 'center' as const,
    },
  } as const;
}
