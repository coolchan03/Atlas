/**
 * Tax material comes in layers of authority and in editions. The Internal Revenue Code (Title 26) is the law; Treasury regulations (the CFR)
 * explain it; Internal Revenue Bulletins carry the IRS's rulings, procedures and notices; IRS publications explain it to taxpayers and are
 * not authority on their own; textbooks come last and go out of date. Within one of these, the newest edition is the one that applies.
 * Atlas reads all of this from a document's name (and, for a standard, its first pages), so nothing has to be tagged by hand. Pure.
 */
export type TaxKind = 'statute' | 'publicLaw' | 'regulation' | 'court' | 'bulletin' | 'publication' | 'textbook';
export interface TaxSource {
  kind: TaxKind;
  /** 1 is the highest authority. */
  rank: number;
  label: string;
  /** The edition's year when the name shows one. */
  year?: number;
  /** Documents of one series are editions of the same work: "pub-17", "irc", "cfr-26". */
  series?: string;
  /** For a court decision: which court, and whether it binds ("Tax Court memorandum, not binding precedent"). */
  detail?: string;
}

export const TAX_KINDS: string[] = ['statute', 'publicLaw', 'regulation', 'court', 'bulletin', 'publication', 'textbook'];
const RANK: Record<TaxKind, number> = { statute: 1, publicLaw: 1, regulation: 2, court: 3, bulletin: 3, publication: 4, textbook: 5 };
const LABEL: Record<TaxKind, string> = { statute: 'Internal Revenue Code', publicLaw: 'Public Law (session law that amended the Code)', court: 'Court decision', regulation: 'Treasury regulations (CFR)', bulletin: 'Internal Revenue Bulletin', publication: 'IRS publication', textbook: 'textbook' };

const REGULATION = /\b(?:26[\s_-]*cfr|cfr|code of federal regulations|treas(?:ury)?\.?[\s_-]*reg)/i;
const STATUTE = /\b(?:title[\s_-]*26|internal revenue code|irc|26[\s_-]*u\.?s\.?c|usc[\s_-]*title[\s_-]*26|uscode)\b/i;
const BULLETIN = /\b(?:irb[\s_-]*\d{2,4}[\s_-]+\d{1,2}|irb|internal revenue bulletin|rev\.?[\s_-]*(?:rul|proc)|revenue[\s_-]*(?:ruling|procedure)|notice[\s_-]*\d{4}-\d+)/i;
const PUBLIC_LAW = /\b(?:public[\s_-]*law|p\.?[\s_-]?l\.?|pub\.?[\s_-]*l\.?)[\s_-]*(\d{2,3})[\s_\u2010-\u2015-]+(\d{1,4})\b/i;
const COURT = /\b(?:tax[\s_-]*court|t\.?c\.?[\s_-]*(?:memo|summ)|tcm|v\.?[\s_-]*commissioner|v\.?[\s_-]*comm'?r|f\.?[\s_-]*(?:2d|3d|4th)|court[\s_-]*of[\s_-]*appeals|circuit|supreme[\s_-]*court|fed(?:eral)?\.?[\s_-]*cl(?:aims)?|district[\s_-]*court)\b/i;
const PUBLICATION = /\b(?:pub(?:lication)?[\s_-]*\d{1,4}[a-z]?|p\d{2,4}[a-z]?(?=[\s_.-]|$))/i;

/** The four-digit year a name shows (the last one when there are several, since "Pub 17 (2023 returns) 2024" is the 2024 edition), or the year of an IRB such as "irb24-31". */
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** Which court a decision is from and what that means for how far it binds, from its name or first page. A statement of fact about the court, not a ruling on the case. */
function courtDetail(text: string): string {
  if (/supreme[\s_-]*court/i.test(text)) return 'U.S. Supreme Court, binding everywhere';
  if (/summary[\s_-]*opinion|t\.?c\.?[\s_-]*summ/i.test(text)) return 'Tax Court summary opinion, not precedent';
  if (/t\.?c\.?[\s_-]*memo|\btcm\b|memorandum[\s_-]*(?:opinion|decision)/i.test(text)) return 'Tax Court memorandum, not binding precedent';
  if (/tax[\s_-]*court/i.test(text)) return 'Tax Court regular opinion';
  const circuit = text.match(/\b(\d{1,2})(?:st|nd|rd|th)[\s_-]*cir/i)?.[1];
  if (circuit) return `Court of Appeals, ${ordinal(Number(circuit))} Circuit, binding in that circuit`;
  if (/d\.?c\.?[\s_-]*cir/i.test(text)) return 'Court of Appeals, D.C. Circuit, binding in that circuit';
  if (/federal[\s_-]*cir|fed\.?[\s_-]*cir/i.test(text)) return 'Court of Appeals, Federal Circuit, binding in that circuit';
  if (/circuit|court[\s_-]*of[\s_-]*appeals|f\.?[\s_-]*(?:2d|3d|4th)/i.test(text)) return 'Court of Appeals, binding in its own circuit';
  return 'trial court, not binding on other courts';
}

function yearOf(name: string): number | undefined {
  const irb = name.match(/\birb[\s_-]*(\d{2})[\s_-]+\d{1,2}\b/i);
  if (irb) return 2000 + Number(irb[1]);
  const years = [...name.matchAll(/(?<!\d)(20\d{2}|19\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  return years.length ? years[years.length - 1] : undefined;
}

/** Which part, subtitle, chapter or section of the Code or the regulations a document is, so different parts are not taken for editions of one work. "26 CFR Part 1" and "Part 301" are two works. */
const partOf = (text: string): string => { const m = text.match(/\b(part|subpart|subtitle|chapter|section|volume|vol)\.?\s*([0-9]+[a-z]?|[ivxlc]+)\b/i); return m ? `-${m[1].toLowerCase().slice(0, 3)}${m[2].toLowerCase()}` : ''; };

let lookup: (name: string) => TaxSource | undefined = (_name) => undefined;
/** What was learned about a document from its first pages when it was added (officialDocs.ts), for names that say little. */
export const setTaxLookup = (fn: (name: string) => TaxSource | undefined): void => { lookup = fn; };

const make = (kind: TaxKind, year?: number, series?: string): TaxSource => ({ kind, rank: RANK[kind], label: LABEL[kind], year, series });
const firstYear = (t: string): number | undefined => { const m = t.match(/(?<!\d)(20\d{2})(?!\d)/); return m ? Number(m[1]) : undefined; };

/**
 * What a document is, from the first pages of its text: "Internal Revenue Bulletin 2024-31", "Publication 17 ... for use in preparing 2024 returns",
 * "Title 26 ... Internal Revenue Code", "26 CFR ... revised as of April 1, 2025". For files whose names say nothing. Null when it does not look like tax material.
 */
export function taxFromText(text: string): TaxSource | null {
  const start = text.slice(0, 4000);
  const bulletin = start.match(/Internal Revenue Bulletin[:\s]*(20\d{2})[-\s]+(\d{1,2})/i);
  if (bulletin) return make('bulletin', Number(bulletin[1]));
  const pub = start.match(/\bPublication\s+(\d{1,4}[A-Z]?)\b/);
  if (pub && /Internal Revenue Service|Cat\. No\./i.test(start)) {
    const prep = start.match(/(?:preparing|tax year|returns?)\D{0,25}(20\d{2})/i);
    return make('publication', prep ? Number(prep[1]) : firstYear(start.slice(0, 800)), `pub-${pub[1].toLowerCase()}`);
  }
  if (/\b26\s*CFR\b|Code of Federal Regulations/i.test(start) && /Title\s+26|Internal Revenue/i.test(start)) {
    const rev = start.match(/revised as of[^.]{0,30}(20\d{2})/i);
    return make('regulation', rev ? Number(rev[1]) : firstYear(start), `cfr-26${partOf(start.slice(0, 600))}`);
  }
  if (/Internal Revenue Code of 1986|Title\s+26[^.]{0,40}Internal Revenue Code/i.test(start)) {
    const cur = start.match(/(?:current through|as of|updated)[^.]{0,40}(20\d{2})/i);
    return make('statute', cur ? Number(cur[1]) : firstYear(start), `irc${partOf(start.slice(0, 600))}`);
  }
  const law = start.match(/\bPublic\s+Law\s+(\d{2,3})\s*[\u2010-\u2015-]\s*(\d{1,4})\b/i);
  if (law && /Internal Revenue Code|Be it enacted|Act\b/i.test(start)) return make('publicLaw', undefined, `pl-${law[1]}-${law[2]}`);
  if (/\bUNITED STATES (?:TAX COURT|COURT OF APPEALS|COURT OF FEDERAL CLAIMS|DISTRICT COURT)\b|\bSupreme Court of the United States\b/i.test(start)) return { ...make('court', firstYear(start)), detail: courtDetail(start) };
  return null;
}

let kindOverride: (name: string) => TaxKind | 'none' | undefined = (_name) => undefined;
/** What the person said a document is (officialDocs.ts), over what its name and first pages show. 'none' says it is not tax material. */
export const setKindLookup = (fn: (name: string) => TaxKind | 'none' | undefined): void => { kindOverride = fn; };

/** What a document is, by its name; null for anything that does not look like tax material at all (it is then just a document). */
export function classifyTaxSource(name: string): TaxSource | null {
  const chosen = kindOverride(name);
  if (chosen === 'none') return null;
  if (chosen) {
    const base = classifyByName(name) ?? lookup(name);
    return { ...make(chosen, base?.year, base?.series), ...(chosen === 'court' ? { detail: base?.detail ?? courtDetail(name) } : {}) };
  }
  const byName = classifyByName(name);
  const learned = lookup(name);
  if (!learned) return byName;
  if (!byName) return learned;
  return { ...byName, year: byName.year ?? learned.year };
}

function classifyByName(name: string): TaxSource | null {
  const n = name.replace(/\.[A-Za-z0-9]{2,5}$/, '').trim();
  const year = yearOf(n);
  const make2 = (kind: TaxKind, series?: string): TaxSource => make(kind, year, series);
  if (REGULATION.test(n)) return make2('regulation', `cfr-26${partOf(n)}`);
  if (BULLETIN.test(n)) return make2('bulletin');
  if (STATUTE.test(n)) return make2('statute', `irc${partOf(n)}`);
  const law = n.match(PUBLIC_LAW);
  if (law) return { ...make('publicLaw', undefined, `pl-${law[1]}-${law[2]}`) };
  if (COURT.test(n)) return { ...make2('court'), detail: courtDetail(n) };
  const pub = n.match(PUBLICATION);
  if (pub) return make2('publication', `pub-${(pub[0].match(/\d{1,4}[a-z]?/i)?.[0] ?? '').toLowerCase()}`);
  return null;
}

/** A source's rank when it is not tax material: a textbook (or any other document you added) comes last. */
export const TEXTBOOK_RANK = RANK.textbook;

/** Editions that a newer edition of the same work replaces: the documents of a series other than its newest. Series with no years are left alone. */
export function supersededEditions(names: string[]): Set<string> {
  const bySeries = new Map<string, Array<{ name: string; year: number }>>();
  for (const name of names) {
    const c = classifyTaxSource(name);
    if (c?.series && c.year) bySeries.set(c.series, [...(bySeries.get(c.series) ?? []), { name, year: c.year }]);
  }
  const old = new Set<string>();
  bySeries.forEach((editions) => {
    const newest = Math.max(...editions.map((e) => e.year));
    editions.filter((e) => e.year < newest).forEach((e) => old.add(e.name));
  });
  return old;
}

/** A short label for a document in a prompt, such as "IRS publication, 2024 edition", or '' for ordinary documents. */
export function taxLabel(name: string): string {
  const c = classifyTaxSource(name);
  return c ? `${c.kind === 'court' && c.detail ? c.detail : c.label}${c.year ? `, ${c.year}` : ''}` : '';
}

/** The order of authority and the rule for editions, to put in a prompt when the project holds tax material. A project can replace it with its own rules (sourceRules). */
export const TAX_RULES = 'These sources differ in authority and age. Rank them, highest first: the Internal Revenue Code and the Public Laws that amended it; Treasury regulations; court decisions (a decision binds only the courts below it, and a Tax Court memorandum or summary opinion is not binding precedent); IRS rulings, procedures and notices; IRS publications and instructions (they explain the law and are not authority on their own); textbooks. Rank decides a conflict, not date: a newer court opinion does not override a statute, and Congress can amend language a court applied. Between editions of the same source, use the most recent, and apply the version in force for the tax year in question. Say which source, edition and date you used. If a source may be out of date, or you cannot check whether a case is still good law, say so.';

export const hasTaxSources = (names: string[]): boolean => names.some((n) => !!classifyTaxSource(n));

/** The tax years a question names ("2024", "tax year 2023"). */
export const yearsAsked = (question: string): number[] => [...new Set([...question.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((m) => Number(m[1])))];

/**
 * Figures in tax material belong to a year. When the question names a year and an excerpt comes from a source of another year, say so, so a
 * limit or rate from one year is not given as another's. Empty when the question names no year or every source matches it.
 */
export function yearNotes(question: string, sourceNames: string[]): string {
  const asked = yearsAsked(question);
  if (!asked.length) return '';
  const off = [...new Set(sourceNames)].map((n) => ({ n, c: classifyTaxSource(n) })).filter((x): x is { n: string; c: TaxSource } => !!x.c?.year && x.c.kind !== 'court' && x.c.kind !== 'publicLaw' && !asked.includes(x.c.year));
  if (!off.length) return '';
  return `The question is about tax year ${asked.join(' and ')}. ${off.map((x) => `${x.n} is for ${x.c.year}`).join('; ')}: do not give figures from a different year as the answer. Say which year each figure is for, and that it may differ.`;
}
