import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { MusicMood, SoundPreset } from './composition';
import { clampMusicVolume } from './playerPolicy';

/** Metadata only. Original WAV and score JSON stay locally in the app's document directory. */
export interface InstrumentalTrack {
  id: string; title: string; path: string; scorePath: string;
  mood: MusicMood; sound: SoundPreset; seconds: number; createdAt: string;
}
interface MusicLibraryState {
  tracks: InstrumentalTrack[];
  volume: number;
  loop: boolean;
  setVolume: (value: number) => void;
  setLoop: (value: boolean) => void;
  addTrack: (track: InstrumentalTrack) => void;
  removeTrack: (id: string) => void;
}
export const useMusicLibrary = create<MusicLibraryState>()(persist((set) => ({
  tracks: [], volume: 0.45, loop: true,
  setVolume: (volume) => set({ volume: clampMusicVolume(volume) }),
  setLoop: (loop) => set({ loop }),
  addTrack: (track) => set((s) => ({ tracks: [track, ...s.tracks.filter((t) => t.id !== track.id)].slice(0, 250) })),
  removeTrack: (id) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
}), {
  name: 'atlas-instrumental-library-v1', version: 1,
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ tracks: s.tracks, volume: s.volume, loop: s.loop }),
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
