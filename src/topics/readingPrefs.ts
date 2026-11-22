import React from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_CHOICES } from '../theme/appearance';
import type { ReadingLook } from '../theme/globalText';

/** How a lesson is read: its own text size, line spacing and font, on top of the app-wide choices. Remembered. */
export type ReadingSize = 'small' | 'normal' | 'large' | 'xlarge';
export type ReadingSpacing = 'tight' | 'normal' | 'roomy';
export type ReadingFont = 'app' | 'book' | 'clean';

export const READING_SIZES: Array<{ id: ReadingSize; name: string; scale: number }> = [
  { id: 'small', name: 'Small', scale: 0.9 }, { id: 'normal', name: 'Normal', scale: 1 },
  { id: 'large', name: 'Large', scale: 1.15 }, { id: 'xlarge', name: 'Largest', scale: 1.3 },
];
export const READING_SPACINGS: Array<{ id: ReadingSpacing; name: string; factor: number }> = [
  { id: 'tight', name: 'Tight', factor: 0.9 }, { id: 'normal', name: 'Normal', factor: 1 }, { id: 'roomy', name: 'Roomy', factor: 1.2 },
];
export const READING_FONTS: Array<{ id: ReadingFont; name: string }> = [
  { id: 'app', name: 'Same as app' }, { id: 'book', name: 'Book' }, { id: 'clean', name: 'Clean' },
];

interface ReadingPrefs {
  size: ReadingSize; spacing: ReadingSpacing; font: ReadingFont;
  set: (p: Partial<Pick<ReadingPrefs, 'size' | 'spacing' | 'font'>>) => void;
}
export const useReadingPrefs = create<ReadingPrefs>()(persist((set) => ({
  size: 'normal', spacing: 'normal', font: 'app',
  set: (p) => set(p),
}), { name: 'atlas-reading-prefs', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ size: s.size, spacing: s.spacing, font: s.font }) }));

/** The choices as the text styling needs them, or null when nothing is changed (so a lesson costs nothing extra by default). */
export function readingLook(p: Pick<ReadingPrefs, 'size' | 'spacing' | 'font'>): ReadingLook | null {
  const scale = READING_SIZES.find((x) => x.id === p.size)?.scale ?? 1;
  const spacing = READING_SPACINGS.find((x) => x.id === p.spacing)?.factor ?? 1;
  const family = p.font === 'app' ? undefined : FONT_CHOICES.find((f) => f.id === (p.font === 'book' ? 'serif' : 'sans'))?.body;
  return scale === 1 && spacing === 1 && !family ? null : { scale, spacing, family };
}

/** The reading look as a stable object for a context provider. */
export function useReadingLook(): ReadingLook | null {
  const size = useReadingPrefs((s) => s.size);
  const spacing = useReadingPrefs((s) => s.spacing);
  const font = useReadingPrefs((s) => s.font);
  return React.useMemo(() => readingLook({ size, spacing, font }), [size, spacing, font]);
}
