import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Whether a table is squeezed to the screen's width (even columns, wrapped text) or kept wide with a sideways scroll. Remembered. */
interface TablePrefs { fit: boolean; setFit: (fit: boolean) => void }
export const useTablePrefs = create<TablePrefs>()(persist((set) => ({
  fit: true,
  setFit: (fit) => set({ fit }),
}), { name: 'atlas-table-fit', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ fit: s.fit }) }));
