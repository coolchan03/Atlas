import type { ExamMode, ExamResult } from './exams';
import type { MasterySummary } from './masteryStore';

/**
 * What has been learned, shown as four separate things that are not the same kind of number and must not be blended into one "accuracy":
 * knowledge that has been checked, claims that disagree, how well practice questions go, and how an exam went in each of its modes.
 * A judge's score is an opinion and is not here at all. Pure.
 */
export interface ProgressInput {
  claims: { verified: number; candidate: number; disputed: number };
  openConflicts: number;
  practice: MasterySummary;
  /** Exam results, newest first. */
  exams: ExamResult[];
}
export interface ProgressSection { title: string; lines: string[] }

const MODE_NAME: Record<ExamMode, string> = { baseline: 'Without sources or memory', sources: 'With sources', memory: 'With what it learned' };
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function progressSections(p: ProgressInput): ProgressSection[] {
  const { claims } = p;
  const knowledge: ProgressSection = {
    title: 'Checked knowledge',
    lines: claims.verified + claims.candidate + claims.disputed === 0
      ? ['Nothing stored yet.']
      : [`${plural(claims.verified, 'claim')} checked against a source`, `${plural(claims.candidate, 'claim')} stored but not yet checked`],
  };
  const conflicts: ProgressSection = {
    title: 'Claims that disagree',
    lines: claims.disputed === 0 && p.openConflicts === 0
      ? ['None open.']
      : [`${plural(claims.disputed, 'claim')} disputed`, `${plural(p.openConflicts, 'conflict')} between claims waiting for a decision`],
  };
  const t = p.practice;
  const practice: ProgressSection = {
    title: 'Practice',
    lines: t.tracked === 0
      ? ['No practice questions answered yet.']
      : [`${plural(t.tracked, 'question')} tracked, ${t.due} due for review, ${t.mastered} mastered`, `Average strength ${pct(t.averageStrength)} (how well they are remembered, not exam accuracy)`],
  };
  const exam: ProgressSection = { title: 'Exam', lines: examLines(p.exams) };
  return [knowledge, conflicts, practice, exam];
}

/** The newest full run of each mode. Each is read by itself: runs of different modes, or of different questions, are never averaged together. */
function examLines(history: ExamResult[]): string[] {
  const lines: string[] = [];
  for (const mode of ['baseline', 'sources', 'memory'] as ExamMode[]) {
    const run = history.find((r) => r.mode === mode && !r.metrics.retest);
    if (!run) continue;
    const m = run.metrics;
    const graded = m.total - (m.ungraded ?? 0);
    if (graded <= 0) { lines.push(`${MODE_NAME[mode]}: no question could be graded`); continue; }
    const backed = m.supportedAccuracy !== undefined && mode !== 'baseline' ? `, ${pct(m.supportedAccuracy)} counting only answers backed by their sources` : '';
    lines.push(`${MODE_NAME[mode]}: ${pct(m.accuracy)} of ${plural(graded, 'graded question')}${backed}${m.ungraded ? ` (${m.ungraded} could not be graded)` : ''}`);
  }
  return lines.length ? lines : ['No exam taken yet.'];
}
