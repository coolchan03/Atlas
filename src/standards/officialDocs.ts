import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setOfficialLookup } from './authority';

/**
 * Documents Atlas treats as the standard itself, whatever they are called. Two ways in: the person marks one (the shield on a
 * document), or Atlas recognises it when it is added, from the first page ("Accounting Standards Update", "FASB Accounting Standards
 * Codification"). A document named like a standard is recognised without either (see authority.ts).
 */
interface S {
  names: string[];
  mark: (name: string) => void;
  unmark: (name: string) => void;
  /** Names the person took the mark off: a document recognised from its first page is not marked again after that. */
  refused: string[];
}

export const useOfficialDocs = create<S>()(
  persist(
    (set) => ({
      names: [],
      refused: [],
      mark: (name) => set((s) => (s.names.includes(name) ? s : { names: [...s.names, name], refused: s.refused.filter((n) => n !== name) })),
      unmark: (name) => set((s) => ({ names: s.names.filter((n) => n !== name), refused: s.refused.includes(name) ? s.refused : [...s.refused, name] })),
    }),
    { name: 'atlas-official-docs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

// The name checks in authority.ts consult the marked names.
setOfficialLookup((name) => useOfficialDocs.getState().names.includes(name));

const STANDARD_BODY = /\b(financial accounting standards board|fasb)\b/i;
const STANDARD_KIND = /\b(accounting standards update|accounting standards codification|statement of financial accounting standards|asc\s*\d{3}|asu\s*\d{4}-\d{2})\b/i;

/** Whether the start of a document's text shows it is a FASB standard or update: the body's name and a standard's name, both on the first pages. */
export function standardFromText(text: string): boolean {
  const start = text.slice(0, 6000);
  return STANDARD_BODY.test(start) && STANDARD_KIND.test(start);
}

/** Called when a document is added: marks it as official when its first pages say it is a standard, unless the person already refused that. */
export function noteIfStandard(name: string, text: string): boolean {
  if (!standardFromText(text) || useOfficialDocs.getState().refused.includes(name)) return false;
  useOfficialDocs.getState().mark(name);
  return true;
}
