import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setOfficialLookup, setStudyMaterialLookup } from './authority';
import { setTypeLookup } from './profiles';
import { setKindLookup, setTaxLookup, taxFromText, TAX_KINDS, type TaxKind, type TaxSource } from './taxSources';

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
  /** Names whose first pages showed a published book or study material, so a standard-like NAME alone no longer makes them an authority. */
  studyMaterial: string[];
  markStudyMaterial: (name: string) => void;
  /** What the person decided a document is for, over the default: lessons are taught from it, or lessons are only checked against it. */
  roles: Record<string, 'teach' | 'reference'>;
  setRole: (name: string, role: 'teach' | 'reference' | null) => void;
  /** What the person said a document is (a statute, a court decision...), over what Atlas guessed. 'none' means it is not tax material. */
  kinds: Record<string, string>;
  setKind: (name: string, kind: string | null) => void;
}

export const useOfficialDocs = create<S>()(
  persist(
    (set) => ({
      names: [],
      refused: [],
      studyMaterial: [],
      markStudyMaterial: (name) => set((s) => (s.studyMaterial.includes(name) ? s : { studyMaterial: [...s.studyMaterial, name] })),
      tax: {},
      roles: {},
      kinds: {},
      setKind: (name, kind) => set((s) => { const next = { ...s.kinds }; if (kind) next[name] = kind; else delete next[name]; return { kinds: next }; }),
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

setStudyMaterialLookup((name) => (useOfficialDocs.getState().studyMaterial ?? []).includes(name));

setTaxLookup((name) => useOfficialDocs.getState().tax[name]);

setKindLookup((name) => {
  const chosen = (useOfficialDocs.getState().kinds ?? {})[name];
  return chosen === 'none' || (chosen && TAX_KINDS.includes(chosen)) ? (chosen as TaxKind | 'none') : undefined; // a type of another profile is not a tax kind
});
setTypeLookup((name) => (useOfficialDocs.getState().kinds ?? {})[name]);

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

/** Signs on the first pages of a published book: an ISBN, an edition statement, learning objectives, a publisher's copyright, review questions. */
const BOOK_SIGNS = [
  /\bisbn(?:-1[03])?\b/i,
  /\b(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+edition\b/i,
  /\blearning objectives?\b/i,
  /copyright[^\n]{0,80}\b(?:pearson|wiley|mcgraw|cengage|elsevier|springer|openstax|oxford university press|cambridge university press|routledge|sage)\b/i,
  /\b(?:review questions|end-of-chapter|chapter summary|key terms)\b/i,
];
/** Whether the start of a document looks like a published book or study guide: at least two of the signs above. A standard-setter's own text has none of them. @public */
export function studyMaterialFromText(text: string): boolean {
  const start = text.slice(0, 6000);
  return BOOK_SIGNS.filter((re) => re.test(start)).length >= 2;
}

/** Called when a document is added: marks it as official when its first pages say it is a standard, unless the person already refused that. */
export function noteIfStandard(name: string, text: string): boolean {
  // A published book is remembered as one, and is NOT marked official however its cover reads: "FASB ASC 842 Guide" names the standard
  // and the body on its title page too. A standard-like file name stops counting for it (a mark the person sets themselves still does).
  if (studyMaterialFromText(text)) { useOfficialDocs.getState().markStudyMaterial(name); return false; }
  if (!standardFromText(text) || useOfficialDocs.getState().refused.includes(name)) return false;
  useOfficialDocs.getState().mark(name);
  return true;
}
