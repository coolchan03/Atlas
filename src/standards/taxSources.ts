/**
 * Tax material comes in layers of authority and in editions. The Internal Revenue Code (Title 26) is the law; Treasury regulations (the CFR)
 * explain it; Internal Revenue Bulletins carry the IRS's rulings, procedures and notices; IRS publications explain it to taxpayers and are
 * not authority on their own; textbooks come last and go out of date. Within one of these, the newest edition is the one that applies.
 * Atlas reads all of this from a document's name (and, for a standard, its first pages), so nothing has to be tagged by hand. Pure.
 */
export type TaxKind = 'statute' | 'regulation' | 'bulletin' | 'publication' | 'textbook';
export interface TaxSource {
  kind: TaxKind;
  /** 1 is the highest authority. */
  rank: number;
  label: string;
  /** The edition's year when the name shows one. */
  year?: number;
  /** Documents of one series are editions of the same work: "pub-17", "irc", "cfr-26". */
  series?: string;
}

const RANK: Record<TaxKind, number> = { statute: 1, regulation: 2, bulletin: 3, publication: 4, textbook: 5 };
const LABEL: Record<TaxKind, string> = { statute: 'Internal Revenue Code', regulation: 'Treasury regulations (CFR)', bulletin: 'Internal Revenue Bulletin', publication: 'IRS publication', textbook: 'textbook' };

const REGULATION = /\b(?:26[\s_-]*cfr|cfr|code of federal regulations|treas(?:ury)?\.?[\s_-]*reg)/i;
const STATUTE = /\b(?:title[\s_-]*26|internal revenue code|irc|26[\s_-]*u\.?s\.?c|usc[\s_-]*title[\s_-]*26|uscode)\b/i;
const BULLETIN = /\b(?:irb[\s_-]*\d{2,4}[\s_-]+\d{1,2}|irb|internal revenue bulletin|rev\.?[\s_-]*(?:rul|proc)|revenue[\s_-]*(?:ruling|procedure)|notice[\s_-]*\d{4}-\d+)/i;
const PUBLICATION = /\b(?:pub(?:lication)?[\s_-]*\d{1,4}[a-z]?|p\d{2,4}[a-z]?(?=[\s_.-]|$))/i;

/** The four-digit year a name shows (the last one when there are several, since "Pub 17 (2023 returns) 2024" is the 2024 edition), or the year of an IRB such as "irb24-31". */
function yearOf(name: string): number | undefined {
  const irb = name.match(/\birb[\s_-]*(\d{2})[\s_-]+\d{1,2}\b/i);
  if (irb) return 2000 + Number(irb[1]);
  const years = [...name.matchAll(/(?<!\d)(20\d{2}|19\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  return years.length ? years[years.length - 1] : undefined;
}

/** What a document is, by its name; null for anything that does not look like tax material at all (it is then just a document). */
export function classifyTaxSource(name: string): TaxSource | null {
  const n = name.replace(/\.[A-Za-z0-9]{2,5}$/, '').trim();
  const year = yearOf(n);
  const make = (kind: TaxKind, series?: string): TaxSource => ({ kind, rank: RANK[kind], label: LABEL[kind], year, series });
  if (REGULATION.test(n)) return make('regulation', 'cfr-26');
  if (BULLETIN.test(n)) return make('bulletin');
  if (STATUTE.test(n)) return make('statute', 'irc');
  const pub = n.match(PUBLICATION);
  if (pub) return make('publication', `pub-${(pub[0].match(/\d{1,4}[a-z]?/i)?.[0] ?? '').toLowerCase()}`);
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
  return c ? `${c.label}${c.year ? `, ${c.year}` : ''}` : '';
}

/** The order of authority and the rule for editions, to put in a prompt when the project holds tax material. */
export const TAX_RULES = 'These sources differ in authority and age. Follow this order: the Internal Revenue Code (Title 26), then the Treasury regulations (CFR), then Internal Revenue Bulletins (rulings, procedures, notices), then IRS publications, then textbooks. When they differ, the higher one is right. Between editions of the same source, use the most recent. Say which source and which edition you used, and the tax year each figure applies to. An IRS publication explains the law and is not authority on its own.';

export const hasTaxSources = (names: string[]): boolean => names.some((n) => !!classifyTaxSource(n));
