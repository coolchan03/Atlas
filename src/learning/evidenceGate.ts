/**
 * Independent, conservative admission gate for research reports.
 * A model's PASS is an opinion, never sufficient to verify a factual claim.
 * These checks catch some contradictions and citation mapping failures; they
 * deliberately do not pretend to establish that passages entail claims.
 */
import { gateFromScore, parseDimensions, verdictMatchesScore, type Dimensions, type GateState } from './judgeDimensions';
import { checkSupport, claimSentences } from './claimText';

export type ClaimStatus = 'candidate' | 'verified' | 'disputed' | 'superseded' | 'rejected';

export interface EvidenceSource {
  n: number;
  title: string;
  kind: string;
  url?: string;
  passage?: string;
  retrievedAt?: string;
  sourceId?: string;
  locator?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  taxYear?: number;
}

export interface GateResult {
  status: Extract<ClaimStatus, 'candidate' | 'disputed' | 'rejected'>;
  judgeScore?: number;
  scoreValid: boolean;
  citedSourceNumbers: number[];
  reasons: string[];
  /** True means citations point to known source records, not that they support the claims. */
  citationMappingsValid: boolean;
  dimensions: Dimensions;
  /** Two independent gates: either one failing disputes the report, whatever the overall score. */
  gates: { facts: GateState; citations: GateState };
}

export function parseJudgeScore(line: string): { value?: number; valid: boolean; reason?: string } {
  const match = line.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/);
  if (!match) return { valid: false, reason: 'Judge did not provide a numeric score out of 10' };
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (denominator !== 10 || numerator < 0 || numerator > 10 || !Number.isFinite(numerator)) {
    return { valid: false, reason: `Invalid judge score ${match[0]}: expected 0-10/10` };
  }
  return { value: numerator, valid: true };
}

/** Deduplicated, numerical report citations; never count repeated [1] twice. */
export function citedNumbers(text: string): number[] {
  const hits: number[] = [];
  const re = /\[(\d{1,6})\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const n = Number(match[1]);
    if (!hits.includes(n)) hits.push(n);
  }
  return hits;
}

/**
 * Conservative alarms for specific recurring mistakes. A match means review,
 * not automatic permanent rejection, and is never a substitute for the source.
 * Focus on assertions in ANSWER/KEY POINTS, not an UNSURE section.
 */
export function taxErrorSignals(report: string): string[] {
  const claimSection = report.split(/^\s*(?:REASONING|UNSURE)\s*:/im)[0];
  const claims = claimSection.replace(/\[(\d+)\]/g, '');
  const alerts: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\b(?:above.the.line deductions?|adjustments? to income)\b[^.!?\n]{0,110}\b(?:increase|raise|boost)s?\b[^.!?\n]{0,35}\bAGI\b/i, 'Above-the-line deductions do not increase AGI'],
    [/\b(?:section\s*199A|199A|QBI|qualified business income)\b[^.!?\n]{0,110}\bitemized deduction\b/i, 'Section 199A QBI deduction is not an itemized deduction'],
    [/\bitemized deduction\b[^.!?\n]{0,110}\b(?:section\s*199A|QBI)\b/i, 'Section 199A QBI deduction is not an itemized deduction'],
    [/\bcommunity.property\b[^.!?\n]{0,110}\b(?:double|doubles|doubling)\b[^.!?\n]{0,65}\b(?:income|taxable)\b/i, 'Community-property allocation does not double combined income'],
    [/\b(?:net investment income tax|NIIT)\b[^.!?\n]{0,115}\b(?:FICA|wage.based|payroll tax)\b/i, 'NIIT and wage-based FICA are different taxes'],
  ];
  for (const [pattern, reason] of patterns) {
    const match = pattern.exec(claims);
    if (!match) continue;
    // Do not block text explicitly explaining that the false statement is incorrect.
    const part = match[0];
    if (/\b(?:not|never|incorrect|wrong|false|isn't|doesn't|do not)\b/i.test(part)) continue;
    alerts.push(reason);
  }
  if (/\bself.employment\b[^.!?\n]{0,80}\b(?:threshold|minimum)\b/i.test(claims) &&
      !/\b(?:tax year|for 20\d{2}|effective|as of 20\d{2})\b/i.test(claims)) {
    alerts.push('Self-employment threshold needs a stated applicable tax year');
  }
  return alerts;
}

/** Cited sentences whose cited passages do not contain what the sentence states. Checked by text, not by the model. */
function unsupportedSentences(text: string, sources: EvidenceSource[]): { checked: number; failed: string[] } {
  let checked = 0;
  const failed: string[] = [];
  for (const sentence of claimSentences(text)) {
    const cited = citedNumbers(sentence);
    const passages = sources.filter((s) => cited.includes(s.n)).map((s) => s.passage ?? '');
    const support = checkSupport(sentence.replace(/\[\d+\]/g, ''), passages);
    if (support.supported === null) continue;
    checked += 1;
    if (support.supported === false) failed.push(support.missingNumbers.length ? `states ${support.missingNumbers.join(', ')} which the cited passage does not contain` : 'is not found in the cited passage');
  }
  return { checked, failed };
}

/** The citation gate: mapped numbers, the passage text itself, and the judge's own mark. Any failure fails the gate. */
function citationGate(input: { invalid: number[]; support: { checked: number; failed: string[] }; mark: number | undefined; reasons: string[] }): GateState {
  const markState = gateFromScore(input.mark);
  input.support.failed.forEach((why) => input.reasons.push(`A cited sentence ${why}`));
  if (markState === 'fail') input.reasons.push(`Judge rated citations ${input.mark}/10`);
  if (input.invalid.length || input.support.failed.length || markState === 'fail') return 'fail';
  return input.support.checked > 0 || markState === 'pass' ? 'pass' : 'unknown';
}

/** The facts gate: a known-error alarm or a low factual mark fails it. A pass means "no material error found", not "verified". */
function factsGate(input: { alarms: string[]; mark: number | undefined; reasons: string[] }): GateState {
  const markState = gateFromScore(input.mark);
  if (markState === 'fail') input.reasons.push(`Judge rated factual correctness ${input.mark}/10`);
  return input.alarms.length ? 'fail' : markState;
}

export function assessReport(input: {
  text: string;
  sources?: EvidenceSource[];
  judgeLine: string;
  judgePass: boolean | null;
}): GateResult {
  const reasons: string[] = [];
  const score = parseJudgeScore(input.judgeLine);
  if (!score.valid && score.reason) reasons.push(score.reason);
  const dimensions = parseDimensions(input.judgeLine);
  const sources = input.sources ?? [];
  const citedSourceNumbers = citedNumbers(input.text);
  const sourceMap = new Map(sources.map((s) => [s.n, s]));
  const invalid = citedSourceNumbers.filter((n) => !sourceMap.has(n));
  if (!citedSourceNumbers.length) reasons.push('Report has no mapped source citations');
  if (invalid.length) reasons.push(`Unknown citation numbers: ${invalid.join(', ')}`);
  const cited = citedSourceNumbers.map((n) => sourceMap.get(n)).filter((x): x is EvidenceSource => Boolean(x));
  if (cited.some((s) => !s.passage?.trim())) reasons.push('Cited source lacks a stored passage or original locator');
  const alarms = taxErrorSignals(input.text);
  reasons.push(...alarms);

  const gates = {
    citations: citationGate({ invalid, support: unsupportedSentences(input.text, sources), mark: dimensions.cites, reasons }),
    facts: factsGate({ alarms, mark: dimensions.facts, reasons }),
  };
  const consistent = verdictMatchesScore(score.value, input.judgePass);
  if (!consistent) reasons.push(`Judge verdict and score disagree (${input.judgePass ? 'PASS' : 'FAIL'} with ${score.value}/10)`);
  let status: GateResult['status'] = 'candidate';
  if (input.judgePass === false) status = 'rejected';
  else if (gates.facts === 'fail' || gates.citations === 'fail' || !consistent) status = 'disputed';
  reasons.push('No independent claim-to-passage entailment check has verified the report');
  return {
    status, judgeScore: score.value, scoreValid: score.valid, citedSourceNumbers, reasons,
    citationMappingsValid: citedSourceNumbers.length > 0 && invalid.length === 0, dimensions, gates,
  };
}
