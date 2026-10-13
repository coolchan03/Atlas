import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Long chats: summarize older messages before the model's memory (context) fills up. */
interface ChatPrefs {
  autoCompress: boolean;
  /** Compress when the chat uses this share of the context (0.5 - 0.9). */
  compressAt: number;
  /** Hide PIN-locked chats from every list until the vault is opened with a PIN. */
  hideLockedChats: boolean;
  set: (p: Partial<Omit<ChatPrefs, 'set'>>) => void;
}
export const useChatPrefs = create<ChatPrefs>()(
  persist((set) => ({ autoCompress: true, compressAt: 0.7, hideLockedChats: false, set: (p) => set(p) }), {
    name: 'atlas-chat-prefs',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ autoCompress: s.autoCompress, compressAt: s.compressAt, hideLockedChats: s.hideLockedChats }),
  }),
);

/** Vault state for this app session: true after a PIN opened the hidden chats. */
export const useVaultSession = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Conversations to show in lists: hides locked chats when the vault is hidden and closed. */
export function visibleConversations<T extends { pinVerifier?: string }>(list: T[], hide: boolean, vaultOpen: boolean): T[] {
  return hide && !vaultOpen ? list.filter((c) => !c.pinVerifier) : list;
}
