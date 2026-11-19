import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** How far each recently read text got, so a document opened again carries on from the part where it was left. */
const KEEP = 30;

interface S {
  positions: Record<string, number>;
  order: string[];
  set: (key: string, index: number) => void;
  clear: (key: string) => void;
}
const useReadResume = create<S>()(
  persist(
    (set) => ({
      positions: {},
      order: [],
      set: (key, index) => set((s) => {
        const order = [key, ...s.order.filter((k) => k !== key)].slice(0, KEEP);
        const positions: Record<string, number> = {};
        for (const k of order) positions[k] = k === key ? index : s.positions[k];
        return { positions, order };
      }),
      clear: (key) => set((s) => {
        const { [key]: _gone, ...positions } = s.positions;
        return { positions, order: s.order.filter((k) => k !== key) };
      }),
    }),
    { name: 'atlas-read-resume', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const readResumeBridge = {
  get: (key: string): number => useReadResume.getState().positions[key] ?? 0,
  set: (key: string, index: number) => useReadResume.getState().set(key, index),
  clear: (key: string) => { if (key in useReadResume.getState().positions) useReadResume.getState().clear(key); },
};
