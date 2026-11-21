/**
 * A wave is the reports written for the questions of one round. The judge checks a few reports at a time and the manager reviews after
 * several judging passes; both used to see only that batch (and a handful of log lines). These helpers give them the whole wave in one short
 * digest, so the judge can catch a report that contradicts or repeats another and the manager sees every verdict, score and gate of the wave.
 */
import type { BankItem, LearnReport } from './store';

const oneLine = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** The reports of the given round, oldest first. A report belongs to the round of the question it answers. */
export function waveReports(log: LearnReport[] | undefined, bank: BankItem[], round: number): LearnReport[] {
  const rounds = new Map(bank.map((b) => [b.id, b.round]));
  return [...(log ?? [])].filter((r) => rounds.get(r.itemId) === round).sort((a, b) => a.at - b.at);
}

const verdict = (r: LearnReport): string => {
  if (r.status === 'waiting') return 'not judged yet';
  const gates = r.gates ? `, facts ${r.gates.facts}, citations ${r.gates.citations}` : '';
  return `${r.status === 'pass' ? 'PASS' : 'FAIL'}${r.score !== undefined ? ` ${r.score}/10` : ''}${gates}${r.verificationStatus === 'disputed' ? ', disputed' : ''}`;
};

/** One line per report: the question, how it was judged and the start of its answer. `exclude` leaves out the reports being judged right now. */
export function waveDigest(reports: LearnReport[], o: { exclude?: string[]; max?: number; answerChars?: number } = {}): string {
  const skip = new Set(o.exclude ?? []);
  const list = reports.filter((r) => !skip.has(r.itemId)).slice(-(o.max ?? 24));
  return list.map((r, i) => `${i + 1}. Q: ${oneLine(r.q, 140)} | ${verdict(r)} | says: ${oneLine(r.text.replace(/^ANSWER:\s*/i, ''), o.answerChars ?? 200)}`).join('\n');
}

/** The count of passes and fails in a wave, for the manager's one-line summary. */
export function waveTally(reports: LearnReport[]): { total: number; passed: number; failed: number; waiting: number } {
  return {
    total: reports.length, passed: reports.filter((r) => r.status === 'pass').length,
    failed: reports.filter((r) => r.status === 'fail').length, waiting: reports.filter((r) => r.status === 'waiting').length,
  };
}
