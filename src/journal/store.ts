import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** How the day felt, from 1 (rough) to 5 (great). */
export const MOODS = [{ value: 1, label: 'Rough', icon: 'cloud-rain' }, { value: 2, label: 'Low', icon: 'cloud' }, { value: 3, label: 'Okay', icon: 'minus' }, { value: 4, label: 'Good', icon: 'sun' }, { value: 5, label: 'Great', icon: 'star' }] as const;

export interface JournalEntry { day: string; text: string; mood: number | null; updatedAt: number }

/** The local calendar day of a moment, as "2026-11-24". */
export function dayKey(at = new Date()): string {
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${m}-${d}`;
}

interface JournalState {
  /** One page for each day, newest first. */
  entries: JournalEntry[];
  save: (day: string, text: string, mood: number | null) => void;
  remove: (day: string) => void;
}

export const useJournal = create<JournalState>()(persist((set) => ({
  entries: [],
  save: (day, text, mood) => set((s) => {
    const rest = s.entries.filter((e) => e.day !== day);
    if (!text.trim() && mood === null) return { entries: rest };
    return { entries: [{ day, text: text.trim(), mood, updatedAt: Date.now() }, ...rest].sort((a, b) => b.day.localeCompare(a.day)) };
  }),
  remove: (day) => set((s) => ({ entries: s.entries.filter((e) => e.day !== day) })),
}), { name: 'atlas-journal', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ entries: s.entries }) }));

/** How many days in a row, ending today (or yesterday when today is not written yet), have a page with words in it. */
export function streak(entries: JournalEntry[], today: string): number {
  const written = new Set(entries.filter((e) => e.text).map((e) => e.day));
  const step = (day: string, by: number): string => dayKey(new Date(Date.parse(`${day}T12:00:00`) + by * 86_400_000));
  let day = written.has(today) ? today : step(today, -1);
  let count = 0;
  while (written.has(day)) { count += 1; day = step(day, -1); }
  return count;
}
