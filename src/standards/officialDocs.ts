import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setOfficialLookup } from './authority';
import { setTaxLookup, taxFromText, type TaxSource } from './taxSources';

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
  /** What the first pages of a document showed it to be (a tax publication, bulletin, regulation or the Code, and its year), for files whose names say nothing. */
  tax: Record<string, TaxSource>;
  setTax: (name: string, found: TaxSource) => void;
  /** What the person decided a document is for, over the default: lessons are taught from it, or lessons are only checked against it. */
  roles: Record<string, 'teach' | 'reference'>;
  setRole: (name: string, role: 'teach' | 'reference' | null) => void;
}

export const useOfficialDocs = create<S>()(
  persist(
    (set) => ({
      names: [],
      refused: [],
      tax: {},
      roles: {},
      setRole: (name, role) => set((s) => { const next = { ...s.roles }; if (role) next[name] = role; else delete next[name]; return { roles: next }; }),
      setTax: (name, found) => set((s) => ({ tax: { ...s.tax, [name]: found } })),
      mark: (name) => set((s) => (s.names.includes(name) ? s : { names: [...s.names, name], refused: s.refused.filter((n) => n !== name) })),
      unmark: (name) => set((s) => ({ names: s.names.filter((n) => n !== name), refused: s.refused.includes(name) ? s.refused : [...s.refused, name] })),
    }),
    { name: 'atlas-official-docs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

// The name checks in authority.ts consult the marked names.
setOfficialLookup((name) => useOfficialDocs.getState().names.includes(name));

setTaxLookup((name) => useOfficialDocs.getState().tax[name]);

/** Called when a document is added: remembers what kind of tax source its first pages show, and which year. */
export function noteTaxSource(name: string, text: string): TaxSource | null {
  const found = taxFromText(text);
  if (found) useOfficialDocs.getState().setTax(name, found);
  return found;
}

const STANDARD_BODY = /\b(financial accounting standards board|fasb)\b/i;
const STANDARD_KIND = /\b(accounting standards update|accounting standards codification|statement of financial accounting standards|asc\s*\d{3}|asu\s*\d{4}-\d{2})\b/i;

/** Whether the start of a document's text shows it is a FASB standard or update: the body's name and a standard's name, both on the first pages. @public */
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
