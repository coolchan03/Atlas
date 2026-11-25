import type { LibraryDocument } from '../types';
import { genericApplicability, periodOf, type Comparison, type LibraryProfile, type ReferenceKeys } from '../profile';

/**
 * United States law (statutes, regulations, court decisions, agency guidance). Reads the usual ways of writing a reference and
 * knows that what controls depends on the period and the court, not on which document is newer.
 */
const SECTION = String.raw`(\d+[A-Za-z]?(?:-\d+)?)`;
const SUBS = String.raw`((?:\([A-Za-z0-9]+\))*)`;

function splitLocator(section: string, subs: string): { base: string; locator?: string } { return { base: section, locator: subs || undefined }; }

/** Reads a typed reference into the forms it may be stored under. */
export function legalReferenceKeys(input: string): ReferenceKeys {
  const t = input.trim().replace(/\s+/g, ' ');
  let m = new RegExp(String.raw`^(?:26\s*U\.?S\.?C\.?|I\.?R\.?C\.?|Internal Revenue Code|Sec(?:tion|\.)?)\s*(?:§+\s*)?${SECTION}${SUBS}$`, 'i').exec(t);
  if (m) {
    const { base, locator } = splitLocator(m[1], m[2]);
    return { exact: [`26 U.S.C. § ${base}`, `IRC § ${base}`, `I.R.C. § ${base}`, `26 USC ${base}`, `Section ${base}`, `IRC ${base}`], prefix: `26 U.S.C. § ${base}`, locator };
  }
  m = new RegExp(String.raw`^(?:(?:26\s*C\.?F\.?R\.?|Treas(?:ury)?\.?\s*Reg(?:ulations?)?\.?|Reg\.?)\s*(?:§+\s*)?)(\d+\.\d+[A-Za-z0-9-]*(?:-\d+)?)${SUBS}$`, 'i').exec(t);
  if (m) {
    const { base, locator } = splitLocator(m[1], m[2]);
    return { exact: [`26 C.F.R. § ${base}`, `Treas. Reg. § ${base}`, `Reg. § ${base}`, `26 CFR ${base}`], prefix: `26 C.F.R. § ${base}`, locator };
  }
  m = /^(?:Pub(?:lic)?\.?\s*L(?:aw)?\.?|P\.?L\.?)\s*(\d+)\s*-\s*(\d+)(.*)$/i.exec(t);
  if (m) return { exact: [`Pub. L. ${m[1]}-${m[2]}`, `Public Law ${m[1]}-${m[2]}`, `P.L. ${m[1]}-${m[2]}`], locator: m[3].trim() || undefined };
  return { exact: [t, t.replace(/§\s*/g, '§ ')], prefix: undefined };
}

const CITATION_PATTERNS: RegExp[] = [
  /\b(?:IRC|I\.R\.C\.|26\s*U\.?S\.?C\.?)\s*§*\s*\d+[A-Za-z]?(?:-\d+)?(?:\([A-Za-z0-9]+\))*/gi,
  /\b(?:Treas\.?\s*Reg\.?|26\s*C\.?F\.?R\.?)\s*§*\s*\d+\.\d+[A-Za-z0-9-]*(?:\([A-Za-z0-9]+\))*/gi,
  /\bPub(?:lic)?\.?\s*L(?:aw)?\.?\s*\d+\s*-\s*\d+/gi,
  /\b\d{1,3}\s+(?:U\.S\.|T\.C\.|F\.\d?d|F\.\s?Supp\.\s?\d?d|S\.\s?Ct\.|B\.T\.A\.)\s+\d{1,4}\b/g,
  /\b(?:Rev\.\s*(?:Rul|Proc)\.|T\.C\.\s*Memo\.|Notice)\s*\d{2,4}\s*-\s*\d+/gi,
];
export function findLegalReferences(text: string): string[] {
  const out = new Set<string>();
  for (const re of CITATION_PATTERNS) for (const m of text.matchAll(re)) out.add(m[0].replace(/\s+/g, ' ').trim());
  return [...out];
}

const kindRank = (kind?: string): number => {
  const k = (kind ?? '').toLowerCase();
  if (k.includes('constitution')) return 6;
  if (k.includes('statute') || k.includes('code')) return 5;
  if (k.includes('treaty')) return 4.5;
  if (k.includes('regulation')) return 4;
  if (k.includes('case') || k.includes('decision') || k.includes('opinion')) return 3.5;
  if (k.includes('ruling') || k.includes('procedure') || k.includes('revenue')) return 2;
  if (k.includes('guidance') || k.includes('notice') || k.includes('publication')) return 1;
  return 0;
};
const isCase = (d: LibraryDocument): boolean => kindRank(d.kind) === 3.5;
const courtLevel = (court?: string): number => {
  const c = (court ?? '').toLowerCase();
  if (/supreme court|u\.?s\.? sup/.test(c)) return 3;
  if (/circuit|court of appeals|cir\./.test(c)) return 2;
  if (/tax court|court of federal claims|district court|board of tax/.test(c)) return 1;
  return 0;
};

/**
 * Which of two authorities controls. It does not rank by date, and it will not name a winner when the data does not settle it:
 * a later enactment may not apply to the period, an older decision can still bind, a court outside the taxpayer's circuit does not.
 */
export function compareLegal(a: LibraryDocument, b: LibraryDocument, ctx: { period?: number; jurisdiction?: string }): Comparison {
  const reasons: string[] = [];
  for (const [name, d] of [['first', a], ['second', b]] as const) {
    const ap = genericApplicability(d, ctx.period);
    if (ap.applies === 'no') return { controls: name === 'first' ? 'b' : 'a', reasons: [`the ${name} document does not apply to ${ctx.period}: ${ap.why}`] };
    if (ap.applies === 'unknown') reasons.push(`the ${name} document's applicability to ${ctx.period ?? 'the period'} is not recorded (${ap.why})`);
  }
  const ra = kindRank(a.kind), rb = kindRank(b.kind);
  if (ra !== rb && !(isCase(a) || isCase(b))) { reasons.push(`${ra > rb ? 'the first' : 'the second'} is a higher form of law (${ra > rb ? a.kind : b.kind} over ${ra > rb ? b.kind : a.kind})`); return { controls: reasons.some((r) => r.includes('not recorded')) ? 'unclear' : ra > rb ? 'a' : 'b', reasons }; }
  if (isCase(a) && isCase(b)) {
    const la = courtLevel(a.facets.court), lb = courtLevel(b.facets.court);
    if (la !== lb && la && lb) { reasons.push('the higher court is binding on the lower court only within its own system; check that the taxpayer is in the same circuit'); return { controls: 'unclear', reasons }; }
    reasons.push('both are decisions: a later decision does not overrule an earlier one unless it says so; check later treatment');
    return { controls: 'unclear', reasons };
  }
  if (isCase(a) !== isCase(b)) { reasons.push('a decision interprets the statute or regulation; the text itself still controls unless the court held it invalid'); return { controls: 'unclear', reasons }; }
  reasons.push('same form of law: the period and the text decide, not the dates of publication');
  return { controls: 'unclear', reasons };
}

export const legalUsProfile: LibraryProfile = {
  id: 'legal-us',
  label: 'United States law',
  referenceKeys: legalReferenceKeys,
  findReferences: findLegalReferences,
  applicability: genericApplicability,
  compare: compareLegal,
  instructions: [
    'Cite the authority by its reference and the part (subsection) you used, and quote the exact words you rely on.',
    'Say which tax year or period each rule applies to. A rule that is not recorded as applying to the period asked about is not established for it.',
    'An old decision can still be controlling and a new law may not apply yet: do not prefer a source because it is newer.',
    'If the library does not mark an authority as verified for current status, say its current status was not verified.',
  ].join(' '),
};

export { periodOf };
