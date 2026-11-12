import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../../utils/generateId';
import type { ChatTonePreset } from '../../services/chatTone';

/** Widgets inside Atlas's own Home screen, never Android launcher widgets. */
export type HomeWidgetAction =
  'chat' | 'call' | 'resume-last' | 'resume-most' |
  'model-picker' | 'music-studio' | 'music-player' | 'learning' |
  'learning-status' | 'daily-brief' | 'recorder' | 'compass' | 'read-aloud';
export interface HomeShortcut {
  id: string;
  title: string;
  action?: HomeWidgetAction;
  agentId?: string;
  projectId?: string;
  conversationId?: string;
  modelId?: string;
  voiceProfileId?: string;
  tone?: ChatTonePreset;
}
interface State {
  shortcuts: HomeShortcut[];
  addShortcut: (data: Omit<HomeShortcut, 'id'>) => HomeShortcut;
  removeShortcut: (id: string) => void;
  updateShortcut: (id: string, data: Partial<Omit<HomeShortcut, 'id'>>) => void;
}
/** Reuse v1 storage so existing saved widgets survive an app update. */
export const useHomeShortcuts = create<State>()(persist((set) => ({
  shortcuts: [],
  addShortcut: (data) => {
    const result = { ...data, title: data.title.trim().slice(0, 65) || 'Home widget', id: generateId() };
    set((s) => ({ shortcuts: [...s.shortcuts, result].slice(-24) }));
    return result;
  },
  removeShortcut: (id) => set((s) => ({ shortcuts: s.shortcuts.filter((x) => x.id !== id) })),
  updateShortcut: (id, data) => set((s) => ({ shortcuts: s.shortcuts.map((x) => x.id === id ? { ...x, ...data } : x) })),
}), {
  name: 'atlas-custom-home-shortcuts-v1', version: 1,
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ shortcuts: s.shortcuts }),
}));

export { isWidgetSafeChat, shortcutDestination, selectResumeConversation } from './homeShortcutPolicy';
export type { ResumableConversation } from './homeShortcutPolicy';
