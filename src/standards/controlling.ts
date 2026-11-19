/**
 * Which authority controls a subject. The body that sets the rule depends on WHO the rule is for: a state or local government follows
 * GASB, a private company or not-for-profit follows FASB's Codification, a public company also the SEC, an audit of a public company
 * the PCAOB (otherwise the AICPA), a tax question the Code and regulations for the tax year. This reads the documents in a project and
 * says which of them control, which control nothing here (a FASB document in a government course), which year or edition does not
 * match, which controlling body has NO document at all, and which textbooks are two editions of the same book. It judges names and
 * years only, so it reports what to check and never claims a lesson is correct. Pure.
 */
export type Body = 'FASB' | 'GASB' | 'SEC' | 'PCAOB' | 'AICPA' | 'IRS';
export type Entity = 'private' | 'public' | 'not-for-profit' | 'government' | 'audit-public' | 'audit' | 'tax' | 'unknown';

const BODY_PATTERNS: Array<[Body, RegExp]> = [
  ['GASB', /\bgasbs?\b|\bgasb\b/i],
  ['FASB', /\bfasb\b|\basc[\s_-]*\d{3}|\basu[\s_-]*\d{4}|\bcodification\b/i],
  ['PCAOB', /\bpcaob\b|\bauditing standard\b|\bAS[\s_-]?\d{4}\b/],
  ['AICPA', /\baicpa\b|\bau-c\b|\bssae\b|\bssars\b|\bstatements? on auditing\b/i],
  ['SEC', /\bsec\b|regulation s-[kx]\b|\bsab\b|staff accounting bulletin/i],
  ['IRS', /\birs\b|title[\s_-]*26|internal revenue|\birc\b|treas(?:ury)?\.? reg|\bcfr\b|\bpub(?:lication)?[\s_-]*\d{2,4}\b/i],
];

/** The standard-setter a document's name points to, or null for a textbook or any other document. */
export function bodyOf(name: string): Body | null {
  const n = name.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  return BODY_PATTERNS.find(([, re]) => re.test(n))?.[0] ?? null;
}

/** Who the rule is for, from the words of the course. */
export function inferEntity(text: string): Entity {
  const t = text.toLowerCase();
  if (/\b(governmental|government-wide|state and local|municipal|gasb|fund financial|proprietary fund)\b/.test(t)) return 'government';
  if (/\b(not-for-profit|nonprofit|non-profit|nfp)\b/.test(t)) return 'not-for-profit';
  if (/\b(audit|attest|assurance|aud\b)/.test(t)) return /\b(public compan|pcaob|issuer)\b/.test(t) ? 'audit-public' : 'audit';
  if (/\b(tax|reg\b|irs|internal revenue|1040|1120|1065)\b/.test(t)) return 'tax';
  if (/\b(public compan|sec filer|10-k|issuer)\b/.test(t)) return 'public';
  if (/\b(far\b|financial accounting|gaap|asc \d|fasb|private compan)\b/.test(t)) return 'private';
  return 'unknown';
}

/** Which bodies control each kind of subject, in order. */
const CONTROLLING: Record<Entity, Body[]> = {
  government: ['GASB'], private: ['FASB'], 'not-for-profit': ['FASB'], public: ['FASB', 'SEC'],
  'audit-public': ['PCAOB'], audit: ['AICPA'], tax: ['IRS'], unknown: [],
};

export interface DocumentFact { name: string; /** Edition or tax year, when known. */ year?: number }
export interface ControllingReport {
  entity: Entity;
  /** Documents that come from a body that controls this subject. */
  controlling: string[];
  /** Controlling bodies with no document in the project: the lesson cannot be checked against them. */
  missing: Body[];
  /** Official documents from a body that does NOT control this subject (for example FASB for a government). */
  notControlling: string[];
  /** Documents whose year differs from the year asked about. */
  wrongYear: string[];
  /** Groups of documents that look like different editions of one work. */
  editionConflicts: string[][];
  notes: string[];
}

const stem = (name: string) => name.replace(/\.[A-Za-z0-9]{2,5}$/, '').toLowerCase().replace(/\b(19|20)\d{2}\b/g, '').replace(/\b(\d+(st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) (edition|ed\.?)\b|\bedition\b|\bed\.?\s*\d+\b|\bv\d+\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function controllingReport(input: { entity: Entity; documents: DocumentFact[]; asOfYear?: number }): ControllingReport {
  const { entity, documents, asOfYear } = input;
  const wanted = CONTROLLING[entity];
  const official = documents.map((d) => ({ d, body: bodyOf(d.name) })).filter((x): x is { d: DocumentFact; body: Body } => x.body !== null);
  const controlling = official.filter((x) => wanted.includes(x.body)).map((x) => x.d.name);
  const notControlling = wanted.length ? official.filter((x) => !wanted.includes(x.body) && !(x.body === 'SEC' && entity === 'audit-public')).map((x) => x.d.name) : [];
  const missing = wanted.filter((b) => !official.some((x) => x.body === b));
  const wrongYear = asOfYear ? documents.filter((d) => d.year && d.year !== asOfYear && (entity === 'tax' || bodyOf(d.name) !== null)).map((d) => d.name) : [];
  const groups = new Map<string, DocumentFact[]>();
  documents.forEach((d) => { const k = stem(d.name); if (k.length > 6) groups.set(k, [...(groups.get(k) ?? []), d]); });
  const editionConflicts = [...groups.values()].filter((g) => g.length > 1 && new Set(g.map((d) => d.year ?? d.name)).size > 1).map((g) => g.map((d) => d.name));
  const notes: string[] = [];
  if (entity === 'unknown') notes.push('Who this lesson is for (private company, government, audit, tax) could not be told, so no controlling body was chosen.');
  if (missing.length) notes.push(`No ${missing.join(' or ')} document is in your project, so lessons on these rules cannot be checked against the controlling standard: add it, or treat the lesson as unverified.`);
  if (notControlling.length) notes.push(`${notControlling.join(', ')} ${notControlling.length === 1 ? 'does' : 'do'} not govern ${entity === 'government' ? 'state and local governments' : 'this subject'}: do not teach from ${notControlling.length === 1 ? 'it' : 'them'} as the rule.`);
  if (wrongYear.length) notes.push(`${wrongYear.join(', ')} ${wrongYear.length === 1 ? 'is' : 'are'} not for ${asOfYear}: check the rule has not changed.`);
  if (editionConflicts.length) notes.push(`Different editions of the same work are in the project (${editionConflicts.map((g) => g.join(' / ')).join('; ')}): use the edition for the exam date and say where they differ.`);
  return { entity, controlling, missing, notControlling, wrongYear, editionConflicts, notes };
}

/** The lines to add to a lesson prompt, or '' when there is nothing to flag. */
export const controllingNote = (r: ControllingReport): string => (r.notes.length ? `${r.notes.join(' ')}\n` : '');
