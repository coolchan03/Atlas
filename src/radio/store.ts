import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_RADIO, type RadioSettings } from './dice';

/** The station's settings, remembered. */
interface RadioSettingsState extends RadioSettings { set: (patch: Partial<RadioSettings>) => void }
export const useRadioSettings = create<RadioSettingsState>()(persist((set) => ({
  ...DEFAULT_RADIO,
  set: (patch) => set(patch),
}), { name: 'atlas-radio', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: ({ set: _set, ...settings }) => settings }));

/** What the station is doing now. Never saved: it describes this run. */
interface RadioRun {
  on: boolean;
  /** One line: "Choosing the sound", "Playing ...". */
  line: string;
  title: string;
  /** What the song is, in words ("a silly punk song about revenge, about my ex-husband"). */
  about: string;
  poem: string[] | null;
  /** True while the poem is being read. */
  reading: boolean;
  problem: string | null;
  songs: number;
  /** The topic the listener asked for, waiting for the next song. */
  request: string | null;
  /** The song playing now was kept: it stays in Music Studio. */
  kept: boolean;
  /** When the sleep timer ends the station (milliseconds since 1970), or null. */
  sleepAt: number | null;
}
export const EMPTY_RUN: RadioRun = { on: false, line: '', title: '', about: '', poem: null, reading: false, problem: null, songs: 0, request: null, kept: false, sleepAt: null };
export const useRadioRun = create<RadioRun>(() => EMPTY_RUN);
