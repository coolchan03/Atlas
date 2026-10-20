import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item } from './lessons';

export interface UnitProgress { stars: number; lessons: number }

interface LanguageState {
  /** Language being learned (a phrase-card language code such as "es-ES"). */
  language: string;
  /** Words for each unit, per language: written once by the model, then kept. */
  content: Record<string, Record<string, Item[]>>;
  progress: Record<string, Record<string, UnitProgress>>;
  xp: number;
  streak: { day: string; count: number };
}

/** Course state for screens to read. Only languageService writes it. */
export const useLanguage = create<LanguageState>()(persist((): LanguageState => ({
  language: 'es-ES', content: {}, progress: {}, xp: 0, streak: { day: '', count: 0 },
}), { name: 'atlas-language', storage: createJSONStorage(() => AsyncStorage) }));
