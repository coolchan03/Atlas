/**
 * A durable "recently deleted" list, so a delete can be undone after the short toast is gone and even after a restart. Ordinary chats and
 * courses only: a protected or private chat, and anything in a protected project, is never copied here (it would sit unprotected), so
 * deleting those stays permanent and says so. Restoring puts an item back exactly where it was (same project, same exam) and never
 * creates a second copy of something that exists again.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localUniqueId } from '../utils/uniqueId';

export const TRASH_DAYS = 7;
export type TrashKind = 'chat' | 'course';
export interface TrashItem { id: string; kind: TrashKind; title: string; /** The original id, used to refuse a duplicate restore. */ originalId: string; deletedAt: number; payload: unknown }

interface State {
  items: TrashItem[];
  add: (item: { kind: TrashKind; originalId: string; title: string; payload: unknown }) => void;
  discard: (id: string) => void;
  purgeExpired: (now?: number) => void;
}

export const isExpired = (item: Pick<TrashItem, 'deletedAt'>, now = Date.now()): boolean => now - item.deletedAt > TRASH_DAYS * 86400000;

export const useTrash = create<State>()(persist((set) => ({
  items: [],
  add: ({ kind, originalId, title, payload }) => set((s) => ({ items: [{ id: localUniqueId('trash'), kind, originalId, title: title.slice(0, 120), deletedAt: Date.now(), payload }, ...s.items.filter((i) => !(i.kind === kind && i.originalId === originalId))].slice(0, 200) })),
  discard: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  purgeExpired: (now = Date.now()) => set((s) => ({ items: s.items.filter((i) => !isExpired(i, now)) })),
}), { name: 'atlas-trash', storage: createJSONStorage(() => AsyncStorage) }));

/** Whether this chat may be kept for recovery. Protected and private chats are not. */
export const chatRecoverable = (c: { pinVerifier?: string; isPrivate?: boolean; protectedBlob?: string }): boolean => !c.pinVerifier && !c.isPrivate && !c.protectedBlob;

/** Whether this course may be kept for recovery: not when it belongs to a protected project. */
export function courseRecoverable(c: { projectId?: string }): boolean {
  if (!c.projectId) return true;
  const { useProjectStore } = require('../stores/projectStore'); // NOSONAR: lazy to keep this module light
  const p = useProjectStore.getState().projects.find((x: { id: string }) => x.id === c.projectId);
  return !(p?.pinVerifier || p?.protectedBlob);
}

/** Puts an item back. Returns a message when it cannot (and why), or null when restored. */
export function restoreFromTrash(id: string): string | null {
  const item = useTrash.getState().items.find((i) => i.id === id);
  if (!item) return 'That item is no longer in Recently deleted.';
  if (isExpired(item)) { useTrash.getState().discard(id); return `It was deleted more than ${TRASH_DAYS} days ago and is gone.`; }
  if (item.kind === 'chat') {
    const { useChatStore } = require('../stores'); // NOSONAR
    if (useChatStore.getState().conversations.some((c: { id: string }) => c.id === item.originalId)) { useTrash.getState().discard(id); return 'This chat already exists, so nothing was restored twice.'; }
    useChatStore.getState().restoreConversation(item.payload);
    require('../services/nearbySync').nearbySync.forgetDeletion('conversations', item.originalId); // NOSONAR: so sync does not delete it again on the other phone
  } else {
    const { useTopics } = require('../topics/store'); // NOSONAR
    if (useTopics.getState().courses.some((c: { id: string }) => c.id === item.originalId)) { useTrash.getState().discard(id); return 'This course already exists, so nothing was restored twice.'; }
    useTopics.setState((s: { courses: unknown[] }) => ({ courses: [item.payload, ...s.courses] }));
  }
  useTrash.getState().discard(id);
  return null;
}
