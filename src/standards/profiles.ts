/**
 * Source profiles: how one field weighs its documents. A project can pick one (federal tax, accounting, equities, crypto, law) or write its
 * own. A profile says what kinds of source the field has and which outranks which, which kinds are replaced by a newer edition (a Code, a
 * standard) and which are only true as of their date (a price, a news item), which official sites to look on for updates, and the rules the AI
 * is given. The ranking and the dates are applied here, in code; the AI is only told the result. Pure: no storage, no network.
 */
import { classifyTaxSource, supersededEditions as taxSuperseded, TAX_RULES, taxLabel, yearNotes } from './taxSources';

interface SourceType {
  id: string; label: string;
  /** 1 outranks 2 and so on. */
  rank: number;
  /** A document is of this type when its name (or first page) matches. */
  match: RegExp;
  /** True when a newer edition of the same document replaces an older one. False for dated material: nothing is replaced, each item is true as of its date. */
  edition: boolean;
  /** Dated material older than this many days is marked stale in the prompt. */
  staleDays?: number;
}
export interface SourceProfile {
  id: string; name: string; types: SourceType[];
  /** Hosts to look on for updates, and to accept pages from. */
  sites: string[];
  rules: string;
}
export interface Classified { type: SourceType; year?: number; /** A full date (2024-11-02) when the name shows one. */ date?: string; series: string }

const ext = (n: string) => n.replace(/\.[A-Za-z0-9]{2,5}$/, '').trim();
/** The documents that are editions of one work: the name without its years and punctuation ("IRS Pub 17 (2023)" and "(2024)" are one series). */
const seriesOf = (name: string): string => ext(name).toLowerCase().replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const dateOf = (name: string): string | undefined => name.match(/(?<!\d)((?:19|20)\d{2})[-_.](0[1-9]|1[0-2])[-_.](0[1-9]|[12]\d|3[01])(?!\d)/)?.slice(1, 4).join('-');
const yearOf = (name: string): number | undefined => { const y = [...name.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)].map((m) => Number(m[1])); return y.length ? y[y.length - 1] : undefined; };

/** Types written highest rank first; the rank is the position. */
const ranked = (list: Array<Omit<SourceType, 'rank'>>): SourceType[] => list.map((t, i) => ({ ...t, rank: i + 1 }));

const ACCOUNTING: SourceProfile = {
  id: 'accounting', name: 'Accounting and auditing',
  types: ranked([
    { id: 'standard', label: 'Accounting or auditing standard', match: /\b(fasb|gasb|asc[\s_-]*\d{3}|asu[\s_-]*\d{4}|codification|pcaob|au-c|ifrs|ias[\s_-]*\d+|ssae|ssars)\b/i, edition: true },
    { id: 'regulator', label: 'Regulator rule or release', match: /\b(sec|regulation s-[kx]|staff accounting bulletin|sab|aicpa)\b/i, edition: true },
    { id: 'interpretation', label: 'Firm or staff interpretation', match: /\b(implementation guide|staff paper|technical inquiry|kpmg|pwc|deloitte|ernst|grant thornton|bdo)\b/i, edition: true },
    { id: 'textbook', label: 'Textbook or notes', match: /\b(textbook|edition|chapter|study guide|notes)\b/i, edition: true },
  ]),
  sites: ['fasb.org', 'asc.fasb.org', 'gasb.org', 'sec.gov', 'pcaobus.org', 'aicpa-cima.com', 'ifrs.org'],
  rules: 'These sources differ in authority. Rank them, highest first: the standards themselves (FASB, GASB, PCAOB, AICPA, IFRS), regulator rules and releases (SEC), firm and staff interpretations, then textbooks. A newer standard overrules a textbook written before it. Between editions of one standard, use the latest one in effect for the period in question. Say which standard, paragraph and effective date you used. If a source may be out of date, say so.',
};

const EQUITIES: SourceProfile = {
  id: 'equities', name: 'Equities and markets',
  types: ranked([
    { id: 'filing', label: 'SEC filing', match: /\b(10-?k|10-?q|8-?k|20-?f|s-1|def ?14a|proxy statement|form[\s_-]*[345]|13[dfg]|edgar|annual report)\b/i, edition: false },
    { id: 'rule', label: 'Exchange or regulator rule', match: /\b(nyse|nasdaq|finra|cboe|cme|regulation (?:nms|sho|s-k)|listing (?:rules|standards)|rule[\s_-]*\d{2}[a-z]?-\d+)\b/i, edition: true },
    { id: 'company', label: 'Company statement', match: /\b(earnings (?:release|call|transcript)|investor (?:relations|presentation)|press release|shareholder letter|guidance)\b/i, edition: false },
    { id: 'data', label: 'Market data', match: /\b(price|prices|quote|ohlc|chart|historical data|options chain|market data|screener)\b/i, edition: false, staleDays: 1 },
    { id: 'research', label: 'Analyst research or news', match: /\b(analyst|research|news|article|opinion|rating|outlook|note)\b/i, edition: false, staleDays: 30 },
  ]),
  sites: ['sec.gov', 'finra.org', 'nyse.com', 'nasdaq.com', 'cboe.com', 'cmegroup.com', 'federalreserve.gov', 'treasury.gov'],
  rules: 'These sources differ in authority and in how fast they go stale. Rank them, highest first: SEC filings, exchange and regulator rules, statements by the company, market data, then analyst research and news. A filing outranks commentary about it. Prices, quotes and news are only true as of their date: always say the date of any figure you use, say when an excerpt shows no date, and treat market data more than a day old as stale. Do not present a forecast, a price target or an opinion as fact, and do not tell the user to buy or sell: give the facts, the sources and the uncertainty.',
};

const CRYPTO: SourceProfile = {
  id: 'crypto', name: 'Cryptocurrency',
  types: ranked([
    { id: 'protocol', label: 'Protocol specification', match: /\b(whitepaper|white paper|bip[-_ ]?\d+|eip[-_ ]?\d+|erc[-_ ]?\d+|yellow paper|specification|improvement proposal|rfc[-_ ]?\d+)\b/i, edition: true },
    { id: 'regulator', label: 'Regulator or law', match: /\b(sec|cftc|fincen|ofac|mica|esma|finra)\b|\b(enforcement action|no-action letter|rulemaking|sanctions? list)\b/i, edition: true },
    { id: 'announcement', label: 'Project or exchange announcement', match: /\b(announcement|listing|delisting|maintenance|governance proposal|forum post|changelog|release notes|incident|post-?mortem)\b/i, edition: false, staleDays: 30 },
    { id: 'data', label: 'On-chain or market data', match: /\b(on-?chain|etherscan|dune|defillama|glassnode|tvl|price|prices|market data|ohlc)\b/i, edition: false, staleDays: 1 },
    { id: 'research', label: 'Research or news', match: /\b(research|news|article|opinion|analysis|report|thread)\b/i, edition: false, staleDays: 30 },
  ]),
  sites: ['sec.gov', 'cftc.gov', 'fincen.gov', 'treasury.gov', 'federalregister.gov', 'eips.ethereum.org', 'bitcoin.org', 'github.com'],
  rules: 'These sources differ in authority and in how fast they go stale. Rank them, highest first: the protocol specification, regulator rules and enforcement, project and exchange announcements, on-chain and market data, then research and news. A specification outranks commentary about it, and a newer version of a specification replaces the older one. Prices, on-chain figures and announcements are only true as of their date: say the date of any figure, say when an excerpt shows none, and treat market data more than a day old as stale. Do not present a forecast as fact or tell the user to buy or sell.',
};

const LAW: SourceProfile = {
  id: 'law', name: 'Law (general)',
  types: ranked([
    { id: 'constitution', label: 'Constitution', match: /\b(constitution|bill of rights)\b/i, edition: false },
    { id: 'statute', label: 'Statute', match: /\b(statutes?|u\.?s\.?c|public law|ordinance|code)\b/i, edition: true },
    { id: 'regulation', label: 'Regulation', match: /\b(cfr|regulations?|administrative code)\b/i, edition: true },
    { id: 'case', label: 'Court decision', match: /\b[a-z]+ v\.? [a-z]+|\b(circuit|court of appeals|supreme court|district court|opinion)\b/i, edition: false },
    { id: 'guidance', label: 'Agency guidance', match: /\b(guidance|opinion letter|advisory|bulletin|notice|faq)\b/i, edition: true },
    { id: 'commentary', label: 'Commentary', match: /\b(treatise|law review|commentary|restatement|hornbook|practice guide|journal)\b/i, edition: true },
  ]),
  sites: ['congress.gov', 'govinfo.gov', 'uscode.house.gov', 'ecfr.gov', 'federalregister.gov', 'supremecourt.gov', 'uscourts.gov'],
  rules: 'These sources differ in authority. Rank them, highest first: the constitution, statutes, regulations, court decisions, agency guidance, then commentary. Rank decides a conflict, not date: a newer decision does not override a statute, and a legislature can amend what a court applied. A court decision binds only the courts below it in the same system. Between editions of the same statute or regulation, use the version in force at the time of the facts. Say which source, section and date you used. If you cannot check that a decision is still good law, say so.',
};

const BUILT_IN: SourceProfile[] = [ACCOUNTING, EQUITIES, CRYPTO, LAW];
export const PROFILE_CHOICES: Array<{ id: string; name: string }> = [{ id: 'auto', name: 'Automatic' }, { id: 'federal-tax', name: 'Federal tax' }, ...BUILT_IN.map((p) => ({ id: p.id, name: p.name })), { id: 'custom', name: 'My own' }];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A profile written by the person, in plain lines:
 *   Statutes | code, statute, u.s.c | edition     (one line per kind of source, highest rank first; "edition" when a newer one replaces an older)
 *   Market data | price, quote | dated 1          (dated material, stale after that many days)
 *   sites: congress.gov, govinfo.gov
 *   rules: The statute controls...
 * Lines that cannot be read are returned as problems so the person can fix them. Pure.
 */
export function parseProfile(text: string): { profile: SourceProfile; problems: string[] } {
  const types: SourceType[] = []; const problems: string[] = [];
  let sites: string[] = []; let rules = '';
  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, n) => {
    const lower = line.toLowerCase();
    if (lower.startsWith('sites:')) { sites = line.slice(6).split(/[,\s]+/).map((s) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()).filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)); return; }
    if (lower.startsWith('rules:')) { rules = line.slice(6).trim(); return; }
    const [label, words = '', mode = ''] = line.split('|').map((s) => s.trim());
    const keys = words.split(',').map((s) => s.trim()).filter(Boolean);
    if (!label || !keys.length) { problems.push(`Line ${n + 1} needs a name and some words to recognise it by, like: Statutes | code, statute | edition`); return; }
    const dated = /^dated(?:\s+(\d+))?$/i.exec(mode);
    types.push({ id: `custom-${types.length + 1}`, label, rank: types.length + 1, match: new RegExp(`(?:${keys.map(escape).join('|')})`, 'i'), edition: !dated && /^edition$/i.test(mode), staleDays: dated?.[1] ? Number(dated[1]) : undefined });
  });
  return { profile: { id: 'custom', name: 'My own', types, sites, rules: rules || `These sources differ in authority. Rank them, highest first: ${types.map((t) => t.label).join(', then ')}. Rank decides a conflict, not date. Say which source and date you used, and say if a source may be out of date.` }, problems };
}

/** The profile a project uses: its choice, else tax when it holds tax material, else none. */
export function profileFor(choice: string | undefined, custom: string | undefined, names: string[]): SourceProfile | 'federal-tax' | null {
  if (choice === 'custom') { const p = parseProfile(custom ?? '').profile; return p.types.length ? p : null; }
  if (choice === 'federal-tax') return 'federal-tax';
  const built = BUILT_IN.find((p) => p.id === choice);
  if (built) return built;
  return names.some((n) => !!classifyTaxSource(n)) ? 'federal-tax' : null;
}

let chosenType: (name: string) => string | undefined = (_name) => undefined;
/** What the person said a document is (officialDocs.ts): a type id of the profile, or 'none'. */
export const setTypeLookup = (fn: (name: string) => string | undefined): void => { chosenType = fn; };

/** What a document is in a profile: its type, year and series; null when it matches none of the types. */
export function classifyIn(profile: SourceProfile, name: string): Classified | null {
  const n = ext(name);
  const chosen = chosenType(name);
  if (chosen === 'none') return null;
  const found = (chosen ? profile.types.find((t) => t.id === chosen) : undefined) ?? profile.types.find((t) => t.match.test(n));
  return found ? { type: found, year: yearOf(n), date: dateOf(n), series: seriesOf(name) } : null;
}

/** A short label for a document in a prompt: its type and date, or '' when it matches nothing. */
function labelIn(profile: SourceProfile | 'federal-tax', name: string): string {
  if (profile === 'federal-tax') return taxLabel(name);
  const c = classifyIn(profile, name);
  return c ? `${c.type.label}${c.date ? `, ${c.date}` : c.year ? `, ${c.year}` : ''}${c.type.edition ? '' : ' (true as of its date)'}` : '';
}

/** Documents a newer edition of the same work replaces: for tax the tax rules; for others the series of an edition type with an earlier year. */
export function supersededIn(profile: SourceProfile | 'federal-tax', names: string[]): Set<string> {
  if (profile === 'federal-tax') return taxSuperseded(names);
  const by = new Map<string, Array<{ name: string; year: number }>>();
  for (const name of names) {
    const c = classifyIn(profile, name);
    if (c?.type.edition && c.year) by.set(`${c.type.id}:${c.series}`, [...(by.get(`${c.type.id}:${c.series}`) ?? []), { name, year: c.year }]);
  }
  const old = new Set<string>();
  by.forEach((editions) => { const newest = Math.max(...editions.map((e) => e.year)); editions.filter((e) => e.year < newest).forEach((e) => old.add(e.name)); });
  return old;
}

/** Dated documents past their stale age, as a note for the prompt. Empty when none. Pure. */
function staleNotes(profile: SourceProfile | 'federal-tax', names: string[], now: Date): string {
  if (profile === 'federal-tax') return '';
  const out: string[] = [];
  for (const name of names) {
    const c = classifyIn(profile, name);
    const when = c?.date ? Date.parse(c.date) : c?.year ? Date.parse(`${c.year}-12-31`) : NaN;
    if (!c?.type.staleDays || !Number.isFinite(when)) continue;
    const age = Math.floor((now.getTime() - when) / 86_400_000);
    if (age > c.type.staleDays) out.push(`${name} is ${age} days old (${c.type.label} older than ${c.type.staleDays} day${c.type.staleDays === 1 ? '' : 's'} is stale)`);
  }
  return out.length ? `Stale: ${out.slice(0, 6).join('; ')}. Say so when you use them.` : '';
}

/** The rules text to give the model: the project's own words when written, else the profile's. */
export function rulesIn(profile: SourceProfile | 'federal-tax', custom?: string): string {
  if (custom?.trim()) return `Rules for reading these sources, set by the user (follow them over any default): ${custom.trim()}`;
  return profile === 'federal-tax' ? TAX_RULES : profile.rules;
}

export interface SourceContext {
  /** The rules text for the prompt. */
  rules: string;
  /** Extra lines for the prompt: stale material, or a year mismatch. */
  notes: string;
  /** Labels each excerpt with what its document is. */
  label?: (name: string) => string;
  /** Documents a newer edition has replaced: left out of answers. */
  retired: Set<string>;
}

/** Everything a project chat's prompt needs from a profile. With no profile, only the person's own rules (if any). */
export function sourceContext(profile: SourceProfile | 'federal-tax' | null, o: { custom?: string; names: string[]; query: string; chunkNames: string[]; now: Date }): SourceContext {
  if (!profile) return { rules: o.custom?.trim() ? `Rules for reading these sources, set by the user (follow them over any default): ${o.custom.trim()}` : '', notes: '', retired: new Set() };
  const retired = supersededIn(profile, o.names);
  const notes = profile === 'federal-tax' ? yearNotes(o.query, o.chunkNames.filter((n) => !retired.has(n))) : staleNotes(profile, o.names.filter((n) => !retired.has(n)), o.now);
  return { rules: rulesIn(profile, o.custom), notes, label: (n) => labelIn(profile, n), retired };
}
