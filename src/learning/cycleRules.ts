import type { BankItem, ReportSource, LearnReport } from './store';
import type { OpenContradiction } from './knowledgeDb';
import type { DueConcept } from './masteryStore';
import { tokens } from './claimText';

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

export type Step =
  | { type: 'resolve'; conflict: OpenContradiction }
  | { type: 'practice'; concepts: DueConcept[] }
  | { type: 'study'; item: BankItem }
  | { type: 'idle' };

/**
 * What the learning cycle does next, in the order that matters: a conflict between two known claims first (a wrong fact
 * spreads), then concepts due for review (so learning is kept, not just added), then the next question of the study plan.
 * The plan itself is the foundations-first order the learner wrote it in.
 */
export function planStep(ctx: { bank: BankItem[]; pendingItemIds: string[]; unaskedConflicts: OpenContradiction[]; due: DueConcept[] }): Step {
  if (ctx.unaskedConflicts.length) return { type: 'resolve', conflict: ctx.unaskedConflicts[0] };
  if (ctx.due.length) return { type: 'practice', concepts: ctx.due };
  const item = ctx.bank.find((b) => b.status === 'approved' && !ctx.pendingItemIds.includes(b.id));
  return item ? { type: 'study', item } : { type: 'idle' };
}

/** The study question made from two claims that disagree. */
export function resolveQuestion(conflict: OpenContradiction): string {
  return `Two claims disagree. A: "${conflict.a.text}" B: "${conflict.b.text}" Which is correct, or when does each apply? Find the source that settles it.`;
}

/** A question the Manager adds must still be about the original task: it shares a word with the task or with an existing question. */
export function onTask(question: string, task: string, bank: Array<{ q: string }>): boolean {
  const words = new Set(tokens(question));
  const anchors = new Set([...tokens(task), ...bank.flatMap((b) => tokens(b.q))]);
  return [...words].some((w) => anchors.has(w));
}

const KEEP_FINISHED = 150;

/** Keeps the question list bounded: the oldest finished questions go first. The knowledge they produced is stored elsewhere and is never touched. */
export function pruneBank(bank: BankItem[]): BankItem[] {
  const finished = bank.filter((b) => b.status === 'rejected' || b.status === 'dropped' || b.status === 'answered');
  if (finished.length <= KEEP_FINISHED) return bank;
  const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((b) => b.id));
  return bank.filter((b) => !drop.has(b.id));
}
