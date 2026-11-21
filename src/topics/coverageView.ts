/**
 * What a course really covers, from facts the course already holds: which books and chapters it was planned from, which of its
 * lessons are written, which were passed, and (for an exam course) which exam objectives no chapter of any book matches. A chapter
 * counts as taught only when its lessons are written AND its tests were passed; "written" alone is not "learned", and an objective
 * no chapter matches is shown as a gap rather than hidden. Pure.
 */
import type { Course } from './store';
import { mapObjectives, describeMap, type Objective } from '../cpa/chapterMap';

export type UnitState = 'not-written' | 'written' | 'tested';
interface UnitCoverage { unit: string; total: number; written: number; state: UnitState }
interface BookLine { doc: string; chapters: number }
export interface CoverageView {
  books: BookLine[];
  units: UnitCoverage[];
  /** One line per exam objective: which books and chapters match it, or that none does. Empty when the course has no objectives. */
  objectives: string[];
  gaps: string[];
  /** Book chapters that match no objective (kept as their own units). */
  unmatched: string[];
  /** Plain statements about what cannot be claimed. */
  caveats: string[];
}

const MADE_IN_CODE = ['drill', 'periodic'];
const PASS_STARS = 2;

export function coverageView(course: Pick<Course, 'bookChapters' | 'squares' | 'content' | 'progress'>, objectives: Objective[] = []): CoverageView {
  const chapters = course.bookChapters ?? [];
  const byBook = new Map<string, number>();
  chapters.forEach((c) => byBook.set(c.doc, (byBook.get(c.doc) ?? 0) + 1));
  const units: UnitCoverage[] = [];
  for (const s of course.squares.filter((q) => !MADE_IN_CODE.includes(q.format))) {
    let u = units.find((x) => x.unit === s.unit);
    if (!u) { u = { unit: s.unit, total: 0, written: 0, state: 'not-written' }; units.push(u); }
    u.total += 1;
    if (course.content[s.key]) u.written += 1;
  }
  for (const u of units) {
    const squares = course.squares.filter((s) => s.unit === u.unit && !MADE_IN_CODE.includes(s.format));
    const tests = squares.filter((s) => s.format !== 'lesson');
    const allWritten = u.written === u.total && u.total > 0;
    const passed = tests.length > 0 && tests.every((s) => (course.progress[s.key]?.stars ?? 0) >= PASS_STARS);
    u.state = allWritten && passed ? 'tested' : u.written > 0 ? 'written' : 'not-written';
  }
  const map = objectives.length && chapters.length ? mapObjectives(objectives, chapters) : null;
  const caveats: string[] = [];
  if (!chapters.length) caveats.push('This course was not planned chapter by chapter from your books, so book coverage cannot be shown.');
  if (chapters.length && byBook.size === 1) caveats.push('Only one book was found with chapters. Add other textbooks to the project and make the course again to teach from all of them.');
  caveats.push('"Matches" compares chapter titles with objectives. It does not prove the lessons teach every concept, example and exception.');
  return {
    books: [...byBook.entries()].map(([doc, n]) => ({ doc, chapters: n })), units,
    objectives: map ? describeMap(map) : [], gaps: map ? map.gaps.map((g) => g.name) : [],
    unmatched: map ? map.unmapped.map((c) => `${c.doc.replace(/\.[A-Za-z0-9]{2,4}$/, '')} ch. ${c.number}${c.title ? `: ${c.title}` : ''}`) : [], caveats,
  };
}

export const STATE_LABEL: Record<UnitState, string> = { 'not-written': 'not written yet', written: 'written, not yet passed', tested: 'written and passed' };
