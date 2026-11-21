import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../../utils/generateId';
import type { ChatTonePreset } from '../../services/chatTone';

/** Widgets inside Atlas's own Home screen, never Android launcher widgets. */
export type HomeWidgetAction =
  'chat' | 'call' | 'resume-last' | 'resume-most' |
  'model-picker' | 'music-studio' | 'music-player' | 'learning' |
  'learning-status' | 'daily-brief' | 'recorder' | 'compass' | 'read-aloud' |
  'course' | 'project' | 'practice' | 'review';
export interface HomeShortcut {
  id: string;
  title: string;
  /** The Feather icon the widget's tile shows; missing means the one that suits its action. */
  icon?: string;
  action?: HomeWidgetAction;
  agentId?: string;
  projectId?: string;
  conversationId?: string;
  /** For a course widget: the board it opens. */
  courseId?: string;
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

export { shortcutDestination, selectResumeConversation } from './homeShortcutPolicy';

/** The icon a widget's tile starts with, by what it does. */
const DEFAULT_WIDGET_ICON: Record<HomeWidgetAction, string> = {
  chat: 'message-circle', call: 'phone', 'resume-last': 'rotate-ccw', 'resume-most': 'star', 'model-picker': 'zap', 'music-studio': 'music', 'music-player': 'music',
  learning: 'trending-up', 'learning-status': 'bar-chart-2', 'daily-brief': 'sun', recorder: 'mic', compass: 'compass', 'read-aloud': 'volume-2',
  course: 'grid', project: 'folder', practice: 'check-square', review: 'repeat',
};
/** Icons a person can give their widget. */
export const WIDGET_ICONS = ['phone', 'message-circle', 'music', 'headphones', 'book', 'book-open', 'sun', 'moon', 'mic', 'compass', 'map', 'folder', 'star', 'heart', 'zap', 'coffee', 'home', 'briefcase', 'camera', 'globe', 'smile', 'bell', 'bookmark', 'calendar', 'clock', 'target', 'users', 'edit-3', 'film', 'gift'] as const;
export const widgetIcon = (w: Pick<HomeShortcut, 'icon' | 'action'>): string => w.icon || DEFAULT_WIDGET_ICON[w.action || 'chat'] || 'circle';
