import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PressureSample } from './pressureTrend';

const KEEP_MS = 72 * 3_600_000;
const EVERY_MS = 10 * 60_000;
const MAX = 450;

interface LogState { samples: PressureSample[]; record: (sample: PressureSample) => void; clear: () => void }

/** Pressure readings kept on this phone for three days, one every ten minutes while the compass is open (nothing is read in the background). */
export const usePressureLog = create<LogState>()(persist((set) => ({
  samples: [],
  record: (sample) => set((s) => {
    const last = s.samples[s.samples.length - 1];
    if (last && sample.at - last.at < EVERY_MS) return s;
    return { samples: [...s.samples, sample].filter((x) => x.at >= sample.at - KEEP_MS).slice(-MAX) };
  }),
  clear: () => set({ samples: [] }),
}), { name: 'atlas-pressure-log', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ samples: s.samples }) }));
