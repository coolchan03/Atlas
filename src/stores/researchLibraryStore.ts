import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InstalledLibrary } from '../services/researchLibrary/types';

/** The research libraries installed on this device. Libraries are large and shared: a project only names the ones it uses (Project.researchLibraryIds). */
interface State {
  libraries: InstalledLibrary[];
  upsert: (lib: InstalledLibrary) => void;
  remove: (id: string) => void;
  get: (id: string) => InstalledLibrary | undefined;
}
export const useResearchLibraryStore = create<State>()(persist((set, get) => ({
  libraries: [],
  upsert: (lib) => set((s) => ({ libraries: [...s.libraries.filter((l) => l.id !== lib.id), lib] })),
  remove: (id) => set((s) => ({ libraries: s.libraries.filter((l) => l.id !== id) })),
  get: (id) => get().libraries.find((l) => l.id === id),
}), { name: 'atlas-research-libraries', storage: createJSONStorage(() => AsyncStorage) }));
