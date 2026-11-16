import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import type { MusicMood, SoundPreset } from './composition';
import { clampMusicVolume } from './playerPolicy';

/** Metadata only. Original WAV and score JSON stay locally in the app's document directory. */
export interface InstrumentalTrack {
  id: string; title: string; path: string; scorePath: string;
  mood: MusicMood; sound: SoundPreset; seconds: number; createdAt: string;
}
/** The SoundFont (real instrument recordings) the person added, kept in the app's folder. */
export interface InstalledSoundfont { name: string; path: string; bytes: number }
interface MusicLibraryState {
  tracks: InstrumentalTrack[];
  volume: number;
  loop: boolean;
  soundfont: InstalledSoundfont | null;
  /** Play on the real instruments when a SoundFont is installed. */
  useSoundfont: boolean;
  setSoundfont: (sf: InstalledSoundfont | null) => void;
  setUseSoundfont: (on: boolean) => void;
  setVolume: (value: number) => void;
  setLoop: (value: boolean) => void;
  addTrack: (track: InstrumentalTrack) => void;
  removeTrack: (id: string) => void;
}
export const useMusicLibrary = create<MusicLibraryState>()(persist((set) => ({
  tracks: [], volume: 0.45, loop: true, soundfont: null, useSoundfont: true,
  setSoundfont: (soundfont) => set({ soundfont }),
  setUseSoundfont: (useSoundfont) => set({ useSoundfont }),
  setVolume: (volume) => set({ volume: clampMusicVolume(volume) }),
  setLoop: (loop) => set({ loop }),
  addTrack: (track) => set((s) => ({ tracks: [track, ...s.tracks.filter((t) => t.id !== track.id)].slice(0, 250) })),
  removeTrack: (id) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
}), {
  name: 'atlas-instrumental-library-v1', version: 1,
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ tracks: s.tracks, volume: s.volume, loop: s.loop, soundfont: s.soundfont, useSoundfont: s.useSoundfont }),
}));

/** Delete exactly the two files for this track after it has been stopped. Never traverse user-chosen paths. */
export async function deleteInstrumentalTrack(track: InstrumentalTrack): Promise<void> {
  const dir = `${RNFS.DocumentDirectoryPath}/atlas-compositions/`;
  if (!track.path.startsWith(dir) || !track.scorePath.startsWith(dir)) throw new Error('Invalid saved instrumental path');
  for (const path of [track.path, track.scorePath]) {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  }
  useMusicLibrary.getState().removeTrack(track.id);
}
