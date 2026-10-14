/**
 * Makes the Appearance font and text size apply to every piece of text at once, without a
 * restart. Many screens use plain inline or static styles (fontSize: 16, no fontFamily) that
 * never see the theme; instead of rewriting each one, Text and TextInput adjust their own
 * style as they render. A tiny store tells every mounted text when the choice changes.
 */
import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { FONT_CHOICES, TEXT_SIZES, type Appearance } from './appearance';

export interface TextAppearance { key: string; scale: number; heading: string; body: string }
const NEUTRAL: TextAppearance = { key: 'atlas:normal', scale: 1, heading: 'serif', body: 'sans-serif' };

let current: TextAppearance = NEUTRAL;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => current;

export function textAppearanceFor(appearance?: Appearance): TextAppearance {
  const font = FONT_CHOICES.find(f => f.id === appearance?.font) ?? FONT_CHOICES[0];
  const size = TEXT_SIZES.find(t => t.id === appearance?.textSize) ?? TEXT_SIZES[1];
  return { key: `${font.id}:${size.id}`, scale: size.scale, heading: font.heading, body: font.body };
}

/** Tell every mounted Text/TextInput about a new choice. */
export function setTextAppearance(next: TextAppearance): void {
  if (next.key === current.key) return;
  current = next;
  listeners.forEach(l => l());
}
export const getTextAppearance = (): TextAppearance => current;

/** Plain system families the app uses by default; only these follow the chosen font. Code (monospace, Menlo) stays. */
const FOLLOWS_FONT = new Set(['sans-serif', 'serif']);

/** The style a text should render with under the given appearance. Returns the input untouched when nothing changes. */
export function adjustTextStyle(style: unknown, a: TextAppearance): unknown {
  if (a.key === NEUTRAL.key) return style;
  const flat = (StyleSheet.flatten(style as any) ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...flat };
  const family = flat.fontFamily;
  if (family === undefined) out.fontFamily = a.body;
  else if (typeof family === 'string' && FOLLOWS_FONT.has(family)) out.fontFamily = family === 'serif' ? a.heading : a.body;
  if (a.scale !== 1) {
    const size = flat.fontSize;
    out.fontSize = typeof size === 'number' ? Math.round(size * a.scale) : Math.round(14 * a.scale); // 14 is React Native's default
    if (typeof flat.lineHeight === 'number') out.lineHeight = Math.round(flat.lineHeight * a.scale);
  }
  return out;
}

let installed = false;
/** Patches Text and TextInput once. `targets` is only for tests. */
export function installTextAppearance(targets: any[] = [Text, TextInput]): void {
  if (installed && targets.length === 2 && targets[0] === Text) return;
  for (const target of targets) {
    if (!target || typeof target.render !== 'function' || target.__atlasText) continue;
    const original = target.render;
    target.__atlasText = true;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- this IS the component's render function
    target.render = function render(this: unknown, props: any, ref: unknown) {
      const a = useSyncExternalStore(subscribe, snapshot);
      return original.call(this, a.key === NEUTRAL.key ? props : { ...props, style: adjustTextStyle(props.style, a) }, ref);
    };
  }
  if (targets.length === 2 && targets[0] === Text) installed = true;
}

/** Patch Text/TextInput and follow the saved Appearance choice (including after it loads from disk). */
export function startTextAppearance(): void {
  installTextAppearance();
  const { useAppStore } = require('../stores/appStore');
  const apply = () => setTextAppearance(textAppearanceFor(useAppStore.getState().settings?.appearance));
  apply();
  useAppStore.subscribe(apply);
}
