import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** What the last check of a court decision's later treatment found (a web search, not a citator). */
interface TreatmentRecord { at: number; results: number; negative: number; flagged: string[] }
interface State {
  checks: Record<string, Record<string, TreatmentRecord>>;
  record: (projectId: string, document: string, found: TreatmentRecord) => void;
}

export const useCaseFile = create<State>()(persist((set) => ({
  checks: {},
  record: (projectId, document, found) => set((s) => ({ checks: { ...s.checks, [projectId]: { ...(s.checks[projectId] ?? {}), [document]: found } } })),
}), { name: 'atlas-case-file', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ checks: s.checks }) }));

/** The case's name as a search would want it, from the document's file name ("Smith_v_Jones_2019.pdf" is "Smith v Jones 2019"). */
export const caseNameFrom = (document: string): string => document.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
