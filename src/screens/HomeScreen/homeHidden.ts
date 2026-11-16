import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Home suggestions the person has swiped or long-pressed away. They stay away until switched back on from the small link where they were. */
export type HiddenHome = 'continue-learning';
interface State { hidden: HiddenHome[]; hide: (key: HiddenHome) => void; show: (key: HiddenHome) => void }
export const useHomeHidden = create<State>()(persist((set) => ({
  hidden: [],
  hide: (key) => set((s) => (s.hidden.includes(key) ? s : { hidden: [...s.hidden, key] })),
  show: (key) => set((s) => ({ hidden: s.hidden.filter((k) => k !== key) })),
}), { name: 'atlas-home-hidden', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ hidden: s.hidden }) }));
