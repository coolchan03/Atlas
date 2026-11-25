import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

/** The audio file last made from a show: which show (its audio key), where it is and how long it plays. Only the newest is kept, like the file itself. */
export interface MadeAudio { key: string; path: string; seconds: number }
interface State { last: MadeAudio | null; record: (audio: MadeAudio) => void }

export const useEpisodeAudio = create<State>()(persist((set) => ({
  last: null,
  record: (audio) => set({ last: audio }),
}), { name: 'atlas-episode-audio', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ last: s.last }) }));

/** The made audio of a show, when it is still on the phone (the cache can be cleared by the system). */
export async function audioFor(key: string): Promise<MadeAudio | null> {
  const last = useEpisodeAudio.getState().last;
  if (!last || last.key !== key) return null;
  try { return (await RNFS.exists(last.path)) ? last : null; } catch { return null; }
}
