import type { LibraryDocument } from './types';

export type Applies = 'yes' | 'no' | 'unknown';
export interface Applicability { applies: Applies; why: string }
export interface Comparison { controls: 'a' | 'b' | 'unclear'; reasons: string[] }
export interface ReferenceKeys {
  /** Spellings a library may store this reference under, most likely first. */
  exact: string[];
  /** A leading part of the reference to list neighbours by (a section and its subsections). */
  prefix?: string;
  /** The part inside the document that was asked for (a subsection, a page). */
  locator?: string;
}

/**
 * What differs between subjects: how a typed reference is read, which period a document applies to, which of two documents
 * controls. The rest of the research library code is the same for every subject. A library names its profile in its manifest.
 */
export interface LibraryProfile {
  id: string;
  label: string;
  /** Reads a typed reference ("IRC 162(a)", "Rule 4.2", "ASC 842-10-25") into the forms to look it up by. */
  referenceKeys(input: string): ReferenceKeys;
  /** References written in free text (an answer), so they can be checked against what was retrieved. */
  findReferences(text: string): string[];
  /** Whether a document applies to a period (a year). Never decided from the publication date alone. */
  applicability(doc: LibraryDocument, period?: number): Applicability;
  /** Which of two documents controls on a point in a period, with reasons; 'unclear' when the data does not settle it. */
  compare(a: LibraryDocument, b: LibraryDocument, ctx: { period?: number; jurisdiction?: string }): Comparison;
  /** Lines added to the model's instructions when the library is used. */
  instructions?: string;
}

const year = (date?: string): number | undefined => { const y = /^(\d{4})/.exec(date ?? '')?.[1]; return y ? Number(y) : undefined; };

/** The span of years a document applies to, from what the library records. */
export function periodOf(doc: LibraryDocument): { from?: number; to?: number; source: 'period' | 'effective' | 'none' } {
  if (doc.periodFrom !== undefined || doc.periodTo !== undefined) return { from: doc.periodFrom, to: doc.periodTo, source: 'period' };
  const from = year(doc.effectiveFrom); const to = year(doc.effectiveTo);
  return from !== undefined || to !== undefined ? { from, to, source: 'effective' } : { source: 'none' };
}

/** Whether a document applies to a period: from its recorded period or effective dates, else unknown. Pure. */
export function genericApplicability(doc: LibraryDocument, period?: number): Applicability {
  if (period === undefined) return { applies: 'unknown', why: 'no period was asked about' };
  const p = periodOf(doc);
  if (p.source === 'none') return { applies: 'unknown', why: 'the library does not record when this applies' };
  const label = p.source === 'period' ? 'applies to' : 'in effect';
  const span = `${p.from ?? 'earlier'} to ${p.to ?? 'now'}`;
  if (p.from !== undefined && period < p.from) return { applies: 'no', why: `${label} ${span}, which starts after ${period}` };
  if (p.to !== undefined && period > p.to) return { applies: 'no', why: `${label} ${span}, which ended before ${period}` };
  return { applies: 'yes', why: `${label} ${span}` };
}

export const genericProfile: LibraryProfile = {
  id: 'generic',
  label: 'General reference',
  referenceKeys: (input) => {
    const t = input.trim().replace(/\s+/g, ' ');
    return { exact: [...new Set([t, t.replace(/[§¶]\s*/g, ''), t.replace(/\.(?=\s|$)/g, '')])].filter(Boolean) };
  },
  findReferences: () => [],
  applicability: genericApplicability,
  compare: (a, b) => {
    if (a.edition && b.edition && a.id !== b.id && Object.keys(a.facets).length === 0) return { controls: 'unclear', reasons: ['two editions: which one applies depends on the period'] };
    return { controls: 'unclear', reasons: ['this library has no precedence rules: read both and say which source each statement comes from'] };
  },
};

const profiles = new Map<string, LibraryProfile>([[genericProfile.id, genericProfile]]);
/** Adds a subject profile. A library whose manifest names an unknown profile falls back to the generic one. */
export function registerProfile(p: LibraryProfile): void { profiles.set(p.id, p); }
export function profileFor(id?: string): LibraryProfile { return profiles.get(id ?? 'generic') ?? genericProfile; }
