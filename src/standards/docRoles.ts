/**
 * What a document is for. A textbook TEACHES: lessons are written from it. The law, regulations, bulletins and standards are REFERENCE: they
 * are dense and exact, so lessons are not written from their raw text; they are looked up for the section a lesson relies on and used to check
 * it (and to correct a book that differs). Chosen automatically from the document, and the person can flip any one.
 */
import { useOfficialDocs } from './officialDocs';
import { documentStanding } from './authority';

export type DocRole = 'teach' | 'reference';

/** The role a document has by default: reference when it is a standard-setter's document, the Code, a regulation or a bulletin; teach otherwise (textbooks, IRS publications, notes, study packs). */
export const defaultRole = (name: string): DocRole => (documentStanding(name).rank <= 3 ? 'reference' : 'teach');

export const roleOf = (name: string): DocRole => useOfficialDocs.getState().roles[name] ?? defaultRole(name);
export const isReference = (name: string): boolean => roleOf(name) === 'reference';
export const isTeaching = (name: string): boolean => roleOf(name) === 'teach';
