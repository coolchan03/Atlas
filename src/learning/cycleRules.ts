import type { ReportSource, LearnReport } from './store';

/** A fingerprint of what a source said, so two searches that return the same text are recognised as the same evidence. */
const fingerprint = (s: Pick<ReportSource, 'title' | 'passage'>) => `${s.title.toLowerCase()}|${(s.passage ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 240)}`;

/** True when the new search found nothing the earlier report was not already written from. */
export function sameEvidence(previous: ReportSource[] | undefined, next: ReportSource[]): boolean {
  if (!previous?.length || !next.length) return false;
  const known = new Set(previous.map(fingerprint));
  return next.every((s) => known.has(fingerprint(s)));
}

/**
 * A report is rewritten only when it can improve. If the judge's facts or citation gate failed and the new search found
 * no new evidence, writing it again would only repeat the same unsupported text.
 */
export function mayRewrite(previous: LearnReport | undefined, next: ReportSource[]): { ok: boolean; reason?: string } {
  if (!previous) return { ok: true };
  const needsEvidence = previous.gates?.facts === 'fail' || previous.gates?.citations === 'fail';
  if (needsEvidence && sameEvidence(previous.sourceList, next)) {
    return { ok: false, reason: 'No new evidence was found, so the report was not rewritten. Add sources or try again later.' };
  }
  return { ok: true };
}
