/**
 * Plain confidence STATES for a stored claim, not invented percentages. A model judge passing a claim never makes it verified: only the
 * person's review does, and only with a source passage. Pure.
 */
import type { ClaimStatus } from './evidenceGate';

export type ConfidenceState = 'verified' | 'source-backed' | 'unreviewed' | 'conflicting' | 'no-evidence' | 'retired';
export interface ConfidenceInfo { state: ConfidenceState; label: string; detail: string }

export function confidenceOf(c: { status: ClaimStatus; sourcePassages: number; citations: number }): ConfidenceInfo {
  if (c.status === 'verified') return { state: 'verified', label: 'Verified by you', detail: 'You reviewed this against a source passage on this phone.' };
  if (c.status === 'disputed') return { state: 'conflicting', label: 'Conflicting', detail: 'Another stored claim or source disagrees. It needs your review.' };
  if (c.status === 'rejected' || c.status === 'superseded') return { state: 'retired', label: c.status === 'rejected' ? 'Rejected' : 'Replaced', detail: 'Not used to answer questions.' };
  if (c.sourcePassages > 0) return { state: 'source-backed', label: 'Source-backed, not reviewed', detail: 'A source passage is stored, but nobody has checked that it proves the claim.' };
  return { state: 'no-evidence', label: 'No adequate evidence', detail: c.citations > 0 ? 'It cites sources but no passage was stored.' : 'No source is stored for it.' };
}

/** Whether a benchmark has enough questions to say anything. Below this the result is shown as a first look, not a measure. */
export const MIN_EXAM_QUESTIONS = 20;
export function sampleNote(total: number): string | null {
  return total < MIN_EXAM_QUESTIONS ? `Only ${total} question${total === 1 ? '' : 's'}: too few to show real improvement. Use at least ${MIN_EXAM_QUESTIONS}.` : null;
}
