/**
 * The judge scores a report on six separate dimensions. Two of them, facts and citations, are acceptance gates of their own:
 * a high overall score or high marks elsewhere never override a material factual error or a citation that does not support its claim.
 */
export interface Dimensions {
  facts?: number;
  cites?: number;
  complete?: number;
  relevant?: number;
  logic?: number;
  clear?: number;
}

export type GateState = 'pass' | 'fail' | 'unknown';

/** Below this score a gate dimension fails. */
export const GATE_MIN = 6;
/** The overall score and the verdict must agree: PASS at least this, FAIL no more than this. */
const PASS_MIN = 6;
const FAIL_MAX = 7;

const NAMES: Array<[keyof Dimensions, string]> = [
  ['facts', 'FACTS?|FACTUAL(?:ITY)?'], ['cites', 'CITES?|CITATIONS?'], ['complete', 'COMPLETE(?:NESS)?'],
  ['relevant', 'RELEVANT|RELEVANCE'], ['logic', 'LOGIC(?:AL)?'], ['clear', 'CLEAR(?:LY|NESS)?|CLARITY'],
];

/** Reads "FACTS 8, CITES 7, COMPLETE 6..." from a judge line. A score outside 0 to 10 is ignored, never guessed. */
export function parseDimensions(line: string): Dimensions {
  const out: Dimensions = {};
  for (const [key, names] of NAMES) {
    const m = new RegExp(`\\b(?:${names})\\b\\s*[:=]?\\s*(\\d{1,2}(?:\\.\\d)?)(?:\\s*/\\s*10)?`, 'i').exec(line);
    const value = m ? Number(m[1]) : NaN;
    if (Number.isFinite(value) && value >= 0 && value <= 10) out[key] = value;
  }
  return out;
}

/** Facts and citations as two independent gates. A missing score is "unknown", not a pass. */
export function gateFromScore(score: number | undefined, min: number = GATE_MIN): GateState {
  if (score === undefined) return 'unknown';
  return score >= min ? 'pass' : 'fail';
}

/** A PASS with a low score, or a FAIL with a high one, is contradictory and needs a person to look. */
export function verdictMatchesScore(score: number | undefined, pass: boolean | null): boolean {
  if (score === undefined || pass === null) return true;
  return pass ? score >= PASS_MIN : score <= FAIL_MAX;
}

/** A judge's reason without the score and dimension marks that come before it, for showing to a person. */
export function plainReason(reason: string): string {
  let out = reason.replace(/\b\d{1,2}(?:\.\d)?\s*\/\s*10\b/g, '');
  for (const [, names] of NAMES) out = out.replace(new RegExp(`\\b(?:${names})\\b\\s*[:=]?\\s*\\d{1,2}(?:\\.\\d)?`, 'gi'), '');
  return out.replace(/^[\s|,;:\-–—]+/, '').replace(/\s{2,}/g, ' ').trim();
}
