/**
 * How demanding the judge is. Small on-device models mark harshly and cannot check facts, so by default the judge is Lenient: it
 * rejects only what is clearly off the task, a duplicate or unsafe, and fails a report only for a clear problem, not for missing
 * detail or a cited sentence that is hard to match word for word. Balanced and Strict keep the stricter gates for bigger models or for
 * subjects (tax, law, medicine) where a small mistake matters. Pure, so it is tested without a device.
 */
export type Strictness = 'lenient' | 'balanced' | 'strict';
export const DEFAULT_STRICTNESS: Strictness = 'lenient';
export const STRICTNESS_OPTIONS: Array<{ id: Strictness; label: string; hint: string }> = [
  { id: 'lenient', label: 'Lenient', hint: 'Best for small on-device models: rejects only what is clearly wrong.' },
  { id: 'balanced', label: 'Balanced', hint: 'Rejects a report when several of its cited sentences do not match their sources.' },
  { id: 'strict', label: 'Strict', hint: 'Any unsupported cited sentence or low mark fails the report. Use a bigger model for the judge.' },
];

export interface Thresholds { gateMin: number; unsupportedShare: number; invalidShare: number; trustVerdict: boolean }
export const THRESHOLDS: Record<Strictness, Thresholds> = {
  strict: { gateMin: 6, unsupportedShare: 0, invalidShare: 0, trustVerdict: false },
  balanced: { gateMin: 5, unsupportedShare: 0.4, invalidShare: 0.5, trustVerdict: false },
  lenient: { gateMin: 3, unsupportedShare: 0.6, invalidShare: 0.8, trustVerdict: true },
};
export const thresholdsFor = (s: Strictness | undefined): Thresholds => THRESHOLDS[s ?? DEFAULT_STRICTNESS];

export type RejectionKind = 'duplicate' | 'off-task' | 'unsafe' | 'vague';
/** What a judge's reason for rejecting a question is about. Anything else is "vague": too general or not specific enough. */
export function rejectionKind(reason: string): RejectionKind {
  if (/duplicat|already (answered|asked|covered)|repeat|same as|overlap/i.test(reason)) return 'duplicate';
  if (/off.?(task|topic)|unrelated|irrelevant|not (about|related|relevant)|outside the (task|scope)/i.test(reason)) return 'off-task';
  if (/unsafe|harm|danger|illegal|weapon|self.?harm/i.test(reason)) return 'unsafe';
  return 'vague';
}

/** Whether a rejection stands: lenient keeps only the clear ones, balanced allows "vague" for at most half the bank, strict keeps all. */
export function rejectionStands(strictness: Strictness | undefined, reason: string, vagueSoFar: number, bankSize: number): boolean {
  const kind = rejectionKind(reason);
  if (kind !== 'vague' || (strictness ?? DEFAULT_STRICTNESS) === 'strict') return true;
  if ((strictness ?? DEFAULT_STRICTNESS) === 'lenient') return false;
  return vagueSoFar < Math.floor(bankSize / 2);
}

/** The judge's instructions for questions and for reports, by how demanding it is. */
export function questionRubric(s: Strictness | undefined): string {
  return (s ?? DEFAULT_STRICTNESS) === 'strict'
    ? 'Reject questions that are off the task, too vague, unsafe, duplicates, or already answered.'
    : 'Approve every question that is about the task, even if it is broad or could be sharper: the learner narrows it when it writes the report. Reject ONLY a question that is clearly off the task, unsafe, an exact duplicate, or already answered.';
}
export function reportRubric(s: Strictness | undefined): string {
  const level = s ?? DEFAULT_STRICTNESS;
  if (level === 'strict') return 'You are a strict but fair judge. Check each report: does it answer the question, does the reasoning make logical sense, does it follow from its sources, is anything unsafe or invented?';
  const lenient = 'PASS a report that answers the question sensibly and agrees with the sources it had. FAIL only when it does not answer the question, contradicts its own sources, is clearly unsafe, or states something you are SURE is wrong. Missing detail, plain wording or a source that is only loosely matched are not reasons to fail. If you are unsure, PASS with a lower score and say what is uncertain.';
  return level === 'lenient' ? `You are a fair judge helping a small AI learn. ${lenient}` : `You are a fair judge. ${lenient} Be careful with numbers, dates and names.`;
}
