/**
 * Which sources have the last word. A textbook is written once and goes out of date; the body that sets the rule publishes the change.
 * So a claim that comes from a standard-setter (FASB, SEC, IRS and so on) overrules an older claim that rests only on textbooks and
 * notes, and the older claim is marked as overruled instead of as a disagreement. Pure: no network, no database.
 */
export interface AuthoritySource { kind?: string; url?: string; title?: string; publicationDate?: string; effectiveFrom?: string }

/** Sites of the bodies that publish the rules themselves. Matching is on the host, so "fasb.org.evil.com" does not count. */
export const OFFICIAL_SITES = [
  'fasb.org', 'asc.fasb.org', 'gasb.org', 'sec.gov', 'pcaobus.org', 'aicpa-cima.com', 'ifrs.org',
  'irs.gov', 'ecfr.gov', 'federalregister.gov', 'govinfo.gov', 'uscode.house.gov', 'treasury.gov',
];

export function hostOf(url: string): string {
  const m = url.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

export const isOfficialUrl = (url: string): boolean => {
  const host = hostOf(url);
  return !!host && OFFICIAL_SITES.some((s) => host === s || host.endsWith(`.${s}`));
};

/**
 * A document you added yourself counts as the standard itself when its name says so: "FASB ...", "ASC 842 ...", "ASU 2016-13 ...", "... Codification ...".
 * Name files that way (the standards pack, one standard per file) and they overrule the textbooks; a textbook with FASB in its title
 * should be renamed, because the name is all Atlas can go on.
 */
const OFFICIAL_NAME = /^(?:fasb|gasb|asc[\s_-]*\d{3}|asu[\s_-]*\d{4}-\d{2}|accounting standards (?:codification|update))|\bcodification\b|\basu[\s_-]*\d{4}-\d{2}\b/i;
/** Names the person (or Atlas, from the first page) marked as the standard itself, wired in by officialDocs.ts so this file stays free of storage. */
let marked: (name: string) => boolean = (_name) => false;
export const setOfficialLookup = (fn: (name: string) => boolean): void => { marked = fn; };
export const isOfficialDocumentName = (name: string): boolean => marked(name) || OFFICIAL_NAME.test(name.replace(/\.[A-Za-z0-9]{2,5}$/, '').trim());

/** A web page of a standard-setter, or a document added under a standard's name. Anything else (books, notes, other web pages) is not an authority on its own. */
export const isOfficialSource = (s: AuthoritySource): boolean => {
  const kind = s.kind ?? 'web';
  if (kind === 'web') return !!s.url && isOfficialUrl(s.url);
  return (kind === 'project' || kind === 'library') && !!s.title && isOfficialDocumentName(s.title);
};

/** The names of the documents in a project that count as the standard itself. */
export const officialDocumentNames = (names: string[]): string[] => names.filter(isOfficialDocumentName);

/** Accounting Standards Update numbers named in a text, newest first ("ASU 2016-13" and "ASU No. 2023-07"). */
export function asuNumbers(text: string): string[] {
  const found = [...text.matchAll(/\bASU\s*(?:No\.?\s*)?(\d{4})-(\d{2})\b/gi)].map((m) => `${m[1]}-${m[2]}`);
  return [...new Set(found)].sort((a, b) => (a < b ? 1 : -1));
}

const dateOf = (s: AuthoritySource): string => s.effectiveFrom || s.publicationDate || '';

/**
 * Does a claim resting on `newer` overrule one resting on `older`? Yes when the new one cites a standard-setter and the old one cites
 * none, unless the old one has a date and every official page of the new one has an earlier one: a newer textbook edition does not
 * lose to an older rule.
 */
export function overrules(newer: AuthoritySource[], older: AuthoritySource[]): boolean {
  const official = newer.filter(isOfficialSource);
  if (!official.length || older.some(isOfficialSource)) return false;
  const oldDates = older.map(dateOf).filter(Boolean).sort();
  const newDates = official.map(dateOf).filter(Boolean).sort();
  if (!oldDates.length || !newDates.length) return true;
  return newDates[newDates.length - 1] >= oldDates[oldDates.length - 1];
}
