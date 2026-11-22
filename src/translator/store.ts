import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TranslatorMode = 'text' | 'interpreter' | 'conversation' | 'camera';
interface TranslationEntry { id: string; from: string | null; to: string; original: string; translation: string; at: number }

const MAX_HISTORY = 30;

/** The translator's choices and its recent translations, remembered. `from` null means "recognise the language". */
interface TranslatorState {
  mode: TranslatorMode;
  from: string | null;
  to: string;
  /** Interpreter and conversation: say the translation aloud. */
  speak: boolean;
  history: TranslationEntry[];
  set: (p: Partial<Pick<TranslatorState, 'mode' | 'from' | 'to' | 'speak'>>) => void;
  /** Swap the two languages (when `from` is recognised automatically there is nothing to swap into, so it is left alone). */
  swap: () => void;
  remember: (e: Omit<TranslationEntry, 'id' | 'at'>) => void;
  clearHistory: () => void;
}

export const useTranslator = create<TranslatorState>()(persist((set, get) => ({
  mode: 'text', from: 'en-US', to: 'es-ES', speak: true, history: [],
  set: (p) => set(p),
  swap: () => { const { from, to } = get(); if (from) set({ from: to, to: from }); },
  remember: (e) => set((s) => ({ history: [{ ...e, id: `${Date.now()}-${s.history.length}`, at: Date.now() }, ...s.history.filter((h) => !(h.original === e.original && h.to === e.to))].slice(0, MAX_HISTORY) })),
  clearHistory: () => set({ history: [] }),
}), { name: 'atlas-translator', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ mode: s.mode, from: s.from, to: s.to, speak: s.speak, history: s.history }) }));
