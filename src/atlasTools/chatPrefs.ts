import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Long chats: summarize older messages before the model's memory (context) fills up. */
interface ChatPrefs {
  autoCompress: boolean;
  /** Compress when the chat uses this share of the context (0.5 - 0.9). */
  compressAt: number;
  set: (p: Partial<Omit<ChatPrefs, 'set'>>) => void;
}
export const useChatPrefs = create<ChatPrefs>()(
  persist((set) => ({ autoCompress: true, compressAt: 0.7, set: (p) => set(p) }), {
    name: 'atlas-chat-prefs',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ autoCompress: s.autoCompress, compressAt: s.compressAt }),
  }),
);
