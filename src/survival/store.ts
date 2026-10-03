import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Survival Manual: reading position and your own notes per chapter. */
interface S {
  pos: Record<string, number>;
  notes: Record<string, string>;
  setPos: (id: string, y: number) => void;
  setNote: (id: string, t: string) => void;
}
export const useSurvivalStore = create<S>()(
  persist(
    (set) => ({
      pos: {},
      notes: {},
      setPos: (id, y) => set((s) => ({ pos: { ...s.pos, [id]: y } })),
      setNote: (id, t) => set((s) => ({ notes: { ...s.notes, [id]: t } })),
    }),
    { name: 'atlas-survival-manual', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
