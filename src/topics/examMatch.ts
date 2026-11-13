/**
 * Matches what your textbooks teach with what an exam asks for. The exam's topic list is the checklist; for each topic this
 * answers three questions: is it in the books you added (searched in the course's project), has the course taught it (a played
 * square about it), and do your practice answers show you understand it. Topics the books do not cover are the gaps to fill
 * from another source; topics the books cover that the course has no square for can be added to the board. Pure apart from
 * the search it is given, so it is tested without a device.
 */
import { EXAMS, type ExamCode } from '../cpa/blueprints';
import { topicEvidence, type Evidence } from '../cpa/progress';
import type { Exercise, Progress } from '../study/exercises';
import type { Course } from './store';

const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'to', 'in', 'on', 'a', 'an', 'basics', 'other', 'select']);
const stems = (text: string): string[] => [...new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)))];

/** How many of the topic's key words (matched by their first five letters) a text contains, against how many it needs. */
export function mentions(topic: string, text: string): boolean {
  const want = stems(topic);
  if (!want.length) return false;
  const have = new Set(stems(text));
  const hits = want.filter((w) => have.has(w)).length;
  return hits >= Math.min(2, want.length);
}

export type InBooks = 'found' | 'thin' | 'missing';
/** Each passage reduced to its key-word stems once, so many topics can be checked against thousands of passages quickly. */
export const indexPassages = (passages: string[]): Set<string>[] => passages.map((p) => new Set(stems(p)));
/** Two or more passages that mention the topic: found. One: thin. None: missing. Every passage is read (a keyword scan, so it works before any search index exists). */
export const coverage = (topic: string, index: Set<string>[]): InBooks => {
  const want = stems(topic);
  const need = Math.min(2, want.length);
  let n = 0;
  if (need) for (const have of index) { if (want.filter((w) => have.has(w)).length >= need && ++n >= 2) break; }
  return n >= 2 ? 'found' : n === 1 ? 'thin' : 'missing';
};

export interface MatchRow { area: string; topic: string; inBooks: InBooks; taught: 'played' | 'planned' | 'none'; evidence: Evidence }

/** The course's square about this topic, if any. */
export const squareAbout = (course: Course, topic: string) => course.squares.find((s) => s.format !== 'quiz' && mentions(topic, `${s.title} ${s.focus}`));

export function matchExam(args: {
  code: ExamCode; course: Course; passages: string[]; exercises: Exercise[]; progress: Record<string, Progress>;
}): MatchRow[] {
  const { code, course, passages, exercises, progress } = args;
  const index = indexPassages(passages);
  const rows: MatchRow[] = [];
  for (const area of EXAMS.find((e) => e.code === code)!.areas) {
    for (const topic of area.topics) {
      const square = squareAbout(course, topic);
      rows.push({
        area: area.area, topic, inBooks: coverage(topic, index),
        taught: square ? (course.progress[square.key] ? 'played' : 'planned') : 'none',
        evidence: topicEvidence(exercises, progress, { topic, projectId: course.projectId }),
      });
    }
  }
  return rows;
}

export interface MatchSummary { total: number; gaps: MatchRow[]; toAdd: MatchRow[]; understood: number; played: number }
/** Gaps: not in the books at all. To add: in the books, but no square on the board yet. */
export function summarize(rows: MatchRow[]): MatchSummary {
  return {
    total: rows.length,
    gaps: rows.filter((r) => r.inBooks === 'missing'),
    toAdd: rows.filter((r) => r.inBooks !== 'missing' && r.taught === 'none'),
    understood: rows.filter((r) => r.evidence.status === 'understood').length,
    played: rows.filter((r) => r.taught === 'played').length,
  };
}
