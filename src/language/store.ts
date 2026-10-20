import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item } from './lessons';
import type { Listening } from './listening';
import type { Memory } from './review';
import type { LevelId } from './teaching';

export interface UnitProgress { stars: number; lessons: number }

interface LanguageState {
  /** Language being learned (a phrase-card language code such as "es-ES"). */
  language: string;
  /** Words for each unit, per language: written once by the model, then kept. */
  content: Record<string, Record<string, Item[]>>;
  progress: Record<string, Record<string, UnitProgress>>;
  xp: number;
  streak: { day: string; count: number };
  /** Stories and podcasts made so far, per language (newest first). */
  listening: Record<string, Listening[]>;
  /** New words the learner saved from stories and podcasts, practised in the "My words" unit. */
  myWords: Record<string, Item[]>;
  /** The level the learner is working at (1 Basic .. 4 Fluent). */
  level: LevelId;
  /** Grammar rules and theme notes the model wrote for units, per language. */
  tips: Record<string, Record<string, string>>;
  /** Spaced-repetition memory of each word, per language (key: the word in the language). */
  memory: Record<string, Record<string, Memory>>;
}

/** Course state for screens to read. Only languageService writes it. */
export const useLanguage = create<LanguageState>()(persist((): LanguageState => ({
  language: 'es-ES', content: {}, progress: {}, xp: 0, streak: { day: '', count: 0 }, listening: {}, myWords: {}, level: 1, tips: {}, memory: {},
}), { name: 'atlas-language', storage: createJSONStorage(() => AsyncStorage) }));
