/**
 * User appearance choices layered on the base light/dark palettes: a theme
 * (background family), an accent color, a font and a text size. One source for
 * the options so the settings screen and the theme hook agree.
 */
import { Platform } from 'react-native';
import { FONTS, TYPOGRAPHY } from '../constants';
import type { ThemeColors } from './palettes';

export type PaletteId = 'classic' | 'black' | 'forest' | 'ocean' | 'dusk' | 'paper';
export type AccentId = 'amber' | 'emerald' | 'blue' | 'violet' | 'rose' | 'teal' | 'red' | 'slate';
export type FontId = 'atlas' | 'sans' | 'serif' | 'mono' | 'condensed' | 'light' | 'medium' | 'casual';
export type TextSizeId = 'small' | 'normal' | 'large' | 'xlarge';
export type LayoutMode = 'standard' | 'simple' | 'compact' | 'colorful';
export type Density = 'comfortable' | 'compact' | 'spacious';
/** How chat messages look: Clean = replies as plain text across the page with a bubble only for your own messages (like ChatGPT and Claude); Bubbles = every message in a box. */
export type ChatLayout = 'clean' | 'bubbles';
export const CHAT_LAYOUTS: Array<{ id: ChatLayout; name: string; hint: string }> = [
  { id: 'clean', name: 'Clean', hint: 'Replies as plain text, tighter spacing, wider on a tablet' },
  { id: 'bubbles', name: 'Bubbles', hint: 'Every message in a box (the earlier look)' },
];
export const LAYOUT_MODES: Array<{ id: LayoutMode; name: string; hint: string }> = [
  { id: 'standard', name: 'Standard', hint: 'Original Atlas home and layout' },
  { id: 'simple', name: 'Simple', hint: 'Large, labeled actions without clutter' },
  { id: 'compact', name: 'Compact', hint: 'Shortcuts and tighter spacing' },
  { id: 'colorful', name: 'Colorful', hint: 'Pastel cards and lively accents' },
];

export interface Appearance {
  palette?: PaletteId;
  accent?: AccentId;
  font?: FontId;
  textSize?: TextSizeId;
  layoutMode?: LayoutMode;
  density?: Density;
  chatLayout?: ChatLayout;
}

type Surfaces = Pick<ThemeColors, 'background' | 'surface' | 'surfaceLight' | 'surfaceHover' | 'border' | 'borderLight' | 'divider'>;
/** [background, surface, surfaceLight, surfaceHover, border, borderLight] */
const surfaces = (c: [string, string, string, string, string, string]): Surfaces =>
  ({ background: c[0], surface: c[1], surfaceLight: c[2], surfaceHover: c[3], border: c[4], borderLight: c[5], divider: c[2] });

export const PALETTES: Array<{ id: PaletteId; name: string; light?: Surfaces; dark?: Surfaces }> = [
  { id: 'classic', name: 'Atlas' },
  { id: 'black', name: 'True black',
    light: surfaces(['#FFFFFF', '#F4F4F4', '#EAEAEA', '#DDDDDD', '#E2E2E2', '#D0D0D0']),
    dark: surfaces(['#000000', '#0E0E0E', '#181818', '#222222', '#1E1E1E', '#2A2A2A']) },
  { id: 'forest', name: 'Forest',
    light: surfaces(['#F4F8F1', '#E8F0E2', '#DCE8D3', '#CFDEC4', '#D3E0C9', '#C0D2B3']),
    dark: surfaces(['#0C1610', '#132119', '#1A2C22', '#22382B', '#1F3326', '#294234']) },
  { id: 'ocean', name: 'Ocean',
    light: surfaces(['#F2F7FB', '#E4EEF6', '#D6E5F0', '#C7DAE9', '#CFDFEC', '#BACFE0']),
    dark: surfaces(['#08131F', '#0F1D2C', '#16283A', '#1E3449', '#1A2E42', '#243B53']) },
  { id: 'dusk', name: 'Dusk',
    light: surfaces(['#F8F4FA', '#EEE6F3', '#E3D7EB', '#D7C8E2', '#DDD0E6', '#CBBAD8']),
    dark: surfaces(['#130E1A', '#1C1526', '#251D33', '#2F2541', '#2A2139', '#362B48']) },
  { id: 'paper', name: 'Paper',
    light: surfaces(['#FFFDF7', '#F7F2E4', '#EFE7D3', '#E6DCC3', '#E9DFC8', '#D9CCAF']),
    dark: surfaces(['#1A1712', '#231F18', '#2C271F', '#363027', '#332D24', '#40392E']) },
];

type Accent = Pick<ThemeColors, 'primary' | 'primaryDark' | 'primaryLight'>;
export const ACCENTS: Array<{ id: AccentId; name: string; light: Accent; dark: Accent }> = [
  { id: 'amber', name: 'Amber', light: { primary: '#B3620F', primaryDark: '#8F4C08', primaryLight: '#D98E3A' }, dark: { primary: '#F2A93B', primaryDark: '#D98E1F', primaryLight: '#F8C56E' } },
  { id: 'emerald', name: 'Emerald', light: { primary: '#047857', primaryDark: '#065F46', primaryLight: '#10B981' }, dark: { primary: '#34D399', primaryDark: '#10B981', primaryLight: '#6EE7B7' } },
  { id: 'blue', name: 'Blue', light: { primary: '#1D4ED8', primaryDark: '#1E3A8A', primaryLight: '#3B82F6' }, dark: { primary: '#60A5FA', primaryDark: '#3B82F6', primaryLight: '#93C5FD' } },
  { id: 'violet', name: 'Violet', light: { primary: '#6D28D9', primaryDark: '#5B21B6', primaryLight: '#8B5CF6' }, dark: { primary: '#A78BFA', primaryDark: '#8B5CF6', primaryLight: '#C4B5FD' } },
  { id: 'rose', name: 'Rose', light: { primary: '#BE185D', primaryDark: '#9D174D', primaryLight: '#EC4899' }, dark: { primary: '#F472B6', primaryDark: '#EC4899', primaryLight: '#F9A8D4' } },
  { id: 'teal', name: 'Teal', light: { primary: '#0F766E', primaryDark: '#115E59', primaryLight: '#14B8A6' }, dark: { primary: '#2DD4BF', primaryDark: '#14B8A6', primaryLight: '#5EEAD4' } },
  { id: 'red', name: 'Red', light: { primary: '#B91C1C', primaryDark: '#991B1B', primaryLight: '#EF4444' }, dark: { primary: '#F87171', primaryDark: '#EF4444', primaryLight: '#FCA5A5' } },
  { id: 'slate', name: 'Slate', light: { primary: '#334155', primaryDark: '#1E293B', primaryLight: '#64748B' }, dark: { primary: '#CBD5E1', primaryDark: '#94A3B8', primaryLight: '#E2E8F0' } },
];

/**
 * Fonts bundled with Atlas (android/app/src/main/assets/fonts, SIL Open Font License), so
 * every choice looks the same on every device. Android's own family names (serif, casual,
 * sans-serif-condensed...) are not reliable: Motorola, Samsung and others let the system font
 * replace them all, so on those phones every choice looked the same. "Atlas" keeps the
 * system look. Other platforms use their system families.
 */
const bundled = (file: string, system: string) => (Platform.OS === 'android' ? file : system);
export const FONT_CHOICES: Array<{ id: FontId; name: string; heading: string; body: string }> = [
  { id: 'atlas', name: 'Atlas', heading: 'serif', body: 'sans-serif' },
  { id: 'sans', name: 'Clean', heading: bundled('AtlasClean', 'sans-serif'), body: bundled('AtlasClean', 'sans-serif') },
  { id: 'serif', name: 'Book', heading: bundled('AtlasBook', 'serif'), body: bundled('AtlasBook', 'serif') },
  { id: 'mono', name: 'Terminal', heading: bundled('AtlasMono', 'monospace'), body: bundled('AtlasMono', 'monospace') },
  { id: 'condensed', name: 'Narrow', heading: bundled('AtlasNarrow', 'sans-serif-condensed'), body: bundled('AtlasNarrow', 'sans-serif-condensed') },
  { id: 'light', name: 'Light', heading: bundled('AtlasLight', 'sans-serif-light'), body: bundled('AtlasLight', 'sans-serif-light') },
  { id: 'medium', name: 'Bold', heading: bundled('AtlasBold', 'sans-serif-medium'), body: bundled('AtlasBold', 'sans-serif-medium') },
  { id: 'casual', name: 'Handwritten', heading: bundled('AtlasHand', 'casual'), body: bundled('AtlasHand', 'casual') },
];

export const TEXT_SIZES: Array<{ id: TextSizeId; name: string; scale: number }> = [
  { id: 'small', name: 'Small', scale: 0.9 },
  { id: 'normal', name: 'Normal', scale: 1 },
  { id: 'large', name: 'Large', scale: 1.15 },
  { id: 'xlarge', name: 'Extra large', scale: 1.3 },
];

/** Applies palette + accent on top of a base light/dark palette. */
export function applyAppearanceColors(base: ThemeColors, isDark: boolean, appearance?: Appearance): ThemeColors {
  if (!appearance) return base;
  const palette = PALETTES.find(p => p.id === appearance.palette);
  const accent = ACCENTS.find(a => a.id === appearance.accent);
  const bg = palette && (isDark ? palette.dark : palette.light);
  const ac = accent && (isDark ? accent.dark : accent.light);
  const colorful = appearance.layoutMode === 'colorful' && !ac;
  const colorfulAccent = isDark ? ACCENTS[3].dark : ACCENTS[5].light;
  const colorfulSurfaces = isDark
    ? surfaces(['#11152B', '#211D38', '#252F43', '#303950', '#3E4160', '#545B77'])
    : surfaces(['#F3F6FF', '#FFF9EC', '#E8F6F3', '#DFF0FF', '#D4DEED', '#B6CEED']);
  if (!bg && !ac && !colorful) return base;
  return { ...base, ...(colorful && !bg ? colorfulSurfaces : {}), ...(bg ?? {}),
    ...(colorful ? { ...colorfulAccent, borderFocus: colorfulAccent.primary } : {}),
    ...(ac ? { ...ac, borderFocus: ac.primary } : {}) };
}

// TYPOGRAPHY is a shared constant read when style sheets are built, so the font family is
// applied to it in place and themed styles rebuild on change. Font SIZE is not applied here:
// theme/globalText scales every Text as it renders, which also covers inline and static
// styles, and scaling in both places would double it.
const BASE_TYPOGRAPHY: Record<string, { heading: boolean }> = Object.fromEntries(
  Object.entries(TYPOGRAPHY).map(([key, value]) => [key, { heading: value.fontFamily === FONTS.heading }]),
);
let appliedTypographyKey = 'atlas:normal';

export function applyTypography(appearance?: Appearance): string {
  const font = FONT_CHOICES.find(f => f.id === appearance?.font) ?? FONT_CHOICES[0];
  const size = TEXT_SIZES.find(t => t.id === appearance?.textSize) ?? TEXT_SIZES[1];
  const key = `${font.id}:${size.id}:${appearance?.layoutMode ?? 'standard'}`;
  if (key === appliedTypographyKey) return key;
  appliedTypographyKey = key;
  FONTS.heading = font.heading;
  FONTS.body = font.body;
  FONTS.mono = font.body;
  for (const [name, style] of Object.entries(TYPOGRAPHY) as Array<[string, { fontFamily: string }]>) {
    const base = BASE_TYPOGRAPHY[name];
    if (!base) continue;
    style.fontFamily = base.heading ? font.heading : font.body;
  }
  return key;
}
