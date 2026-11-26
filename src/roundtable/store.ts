import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from './engine';

/** Saved roundtables are kept for returning to (a game you are playing, a debate you want to read again). */
const KEEP = 40;

interface RoundtableState {
  sessions: Session[];
  /** Saves or replaces a session, newest first. A half-finished turn is never stored as running: it comes back as stopped. */
  save: (s: Session) => void;
  remove: (id: string) => void;
  get: (id: string) => Session | undefined;
}

export const useRoundtables = create<RoundtableState>()(persist((set, get) => ({
  sessions: [],
  save: (s) => set((st) => ({ sessions: [{ ...s, status: s.status === 'running' ? 'stopped' : s.status }, ...st.sessions.filter((x) => x.id !== s.id)].slice(0, KEEP) })),
  remove: (id) => set((st) => ({ sessions: st.sessions.filter((x) => x.id !== id) })),
  get: (id) => get().sessions.find((x) => x.id === id),
}), { name: 'atlas-roundtable', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ sessions: s.sessions }) }));
