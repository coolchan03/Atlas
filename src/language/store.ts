import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Exercise, Item } from './lessons';
import type { Listening } from './listening';
import type { Memory } from './review';
import type { LevelId } from './teaching';
import type { ExerciseKind, Pace } from './pace';

export interface UnitProgress { stars: number; lessons: number }

/** A lesson left part-way, so it carries on where the learner stopped. */
export interface SavedLesson {
  key: string;
  exercises: Exercise[];
  index: number;
  right: number;
  results: { t: string; right: boolean }[];
  savedAt: number;
}

interface LanguageState {
  /** Language being learned (a phrase-card language code such as "es-ES"). */
  language: string;
  /** Words for each unit, per language: written once by the model, then kept. */
  content: Record<string, Record<string, Item[]>>;
  /** Stars per board space, per language (key: see board.ts). */
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
  /** How long the learner takes on each kind of exercise (sizes lessons to about 5 minutes). */
  pace: Partial<Record<ExerciseKind, Pace>>;
  /** Unfinished lessons, per language. */
  saved: Record<string, SavedLesson | undefined>;
  /** Right / wrong sounds in the games. */
  sounds: boolean;
  /** Word translations looked up by tapping a word, per language (lower-case word -> English). */
  glossary: Record<string, Record<string, string>>;
}

/**
 * Course state for screens to read. Only languageService writes it. It is kept on the phone
 * between launches and included in Atlas backups (atlasTools/backup), so progress survives a
 * reinstall or a move to a new phone.
 */
export const useLanguage = create<LanguageState>()(persist((): LanguageState => ({
  language: 'es-ES', content: {}, progress: {}, xp: 0, streak: { day: '', count: 0 }, listening: {}, myWords: {},
  level: 1, tips: {}, memory: {}, pace: {}, saved: {}, sounds: true, glossary: {},
}), { name: 'atlas-language', storage: createJSONStorage(() => AsyncStorage) }));
