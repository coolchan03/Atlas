import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Capsule {
  id: string;
  letter: string;
  sealedAt: number;
  /** The moment it can be read. Before it, the letter is hidden. */
  opensAt: number;
  /** The look back at the journal, written the first time the capsule is read. */
  summary?: string;
}

export const MAX_LETTER = 6000;
export const OPEN_AFTER = [
  { label: 'In 1 month', months: 1 }, { label: 'In 6 months', months: 6 }, { label: 'In 1 year', months: 12 }, { label: 'In 5 years', months: 60 },
] as const;

/** The time `months` calendar months after `from`. Pure. */
export function monthsAfter(from: number, months: number): number {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** True when the letter may be read. The only check is the clock. */
export const isOpen = (c: Capsule, now = Date.now()): boolean => now >= c.opensAt;

interface CapsuleState {
  capsules: Capsule[];
  seal: (letter: string, opensAt: number, now?: number) => string | null;
  setSummary: (id: string, summary: string) => void;
  remove: (id: string) => void;
}

export const useCapsules = create<CapsuleState>()(persist((set) => ({
  capsules: [],
  seal: (letter, opensAt, now = Date.now()) => {
    const text = letter.trim().slice(0, MAX_LETTER);
    if (!text || opensAt <= now) return null;
    const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ capsules: [...s.capsules, { id, letter: text, sealedAt: now, opensAt }].sort((a, b) => a.opensAt - b.opensAt) }));
    return id;
  },
  setSummary: (id, summary) => set((s) => ({ capsules: s.capsules.map((c) => (c.id === id ? { ...c, summary } : c)) })),
  remove: (id) => set((s) => ({ capsules: s.capsules.filter((c) => c.id !== id) })),
}), { name: 'atlas-capsules', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ capsules: s.capsules }) }));
