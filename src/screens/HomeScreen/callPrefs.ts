import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CallChoice } from './quickCall';

interface State { last: CallChoice; remember: (choice: CallChoice) => void }

/** The agent, model and project folder of the last call, so the next one is two taps. */
export const useCallPrefs = create<State>()(persist((set) => ({
  last: {},
  remember: (last) => set({ last }),
}), { name: 'atlas-call-prefs', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ last: s.last }) }));
