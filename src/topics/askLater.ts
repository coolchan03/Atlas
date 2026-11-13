import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localUniqueId } from '../utils/uniqueId';

export interface SavedQuestion { id: string; courseId: string; text: string; at: number }
interface State {
  questions: SavedQuestion[];
  add: (courseId: string, text: string) => boolean;
  remove: (id: string) => void;
}

/** Questions that come up while studying, saved on the course to ask the tutor later (typed or spoken). Stays on this phone and in backups. */
export const useAskLater = create<State>()(persist((set) => ({
  questions: [],
  add: (courseId, text) => {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!clean) return false;
    set((s) => ({ questions: [{ id: localUniqueId('q'), courseId, text: clean, at: Date.now() }, ...s.questions].slice(0, 200) }));
    return true;
  },
  remove: (id) => set((s) => ({ questions: s.questions.filter((q) => q.id !== id) })),
}), { name: 'atlas-ask-later', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ questions: s.questions }) }));
