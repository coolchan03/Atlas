import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addFix, type TrailPoint } from './geometry';

export interface Trail {
  id: string; name: string; startedAt: number; endedAt?: number; points: TrailPoint[];
  /** The journal page written for this trail, kept so it is not written twice. */
  page?: string;
}

interface TrailState {
  trails: Trail[];
  /** The trail being recorded now, if any. */
  activeId: string | null;
  start: (name: string, now?: number) => string;
  fix: (f: { lat: number; lon: number; accuracy: number; altitude: number; time: number }) => void;
  stop: (now?: number) => void;
  setPage: (id: string, page: string) => void;
  remove: (id: string) => void;
}

const MAX_TRAILS = 40;

export const useTrails = create<TrailState>()(persist((set) => ({
  trails: [], activeId: null,
  start: (name, now = Date.now()) => {
    const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const d = new Date(now);
    const title = name.trim().slice(0, 40) || `Walk on ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    set((s) => ({ trails: [{ id, name: title, startedAt: now, points: [] } as Trail, ...s.trails].slice(0, MAX_TRAILS), activeId: id }));
    return id;
  },
  fix: (f) => set((s) => {
    if (!s.activeId) return s;
    return { trails: s.trails.map((t) => (t.id === s.activeId ? { ...t, points: addFix(t.points, f) } : t)) };
  }),
  stop: (now = Date.now()) => set((s) => ({ activeId: null, trails: s.trails.map((t) => (t.id === s.activeId ? { ...t, endedAt: now } : t)) })),
  setPage: (id, page) => set((s) => ({ trails: s.trails.map((t) => (t.id === id ? { ...t, page } : t)) })),
  remove: (id) => set((s) => ({ trails: s.trails.filter((t) => t.id !== id), activeId: s.activeId === id ? null : s.activeId })),
}), { name: 'atlas-trails', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ trails: s.trails, activeId: s.activeId }) }));
