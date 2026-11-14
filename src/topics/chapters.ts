/**
 * The chapters of a textbook, found in its text: lines such as "Chapter 7: Leases", "CHAPTER 7 Leases" or "Unit 3 - Ratios". A real chapter
 * heading is followed by pages of text; the same words in a table of contents are followed by the next entry straight away, so those are
 * dropped. A course can then be built with one unit per chapter, each ending in a test of that chapter. Pure, so it is tested without a device.
 */
export interface Chapter { number: number; title: string; /** How much text follows the heading before the next chapter. */ size: number }

const HEADING = /^\s*(?:\(p\. \d+\)\s*)?(chapter|unit|module|lesson|part)\s+(\d{1,3}|[ivxlc]{1,6})\b[\s:.\-–—]*(.{0,90})$/i;
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
const toNumber = (token: string): number => {
  if (/^\d+$/.test(token)) return Number(token);
  let total = 0; const t = token.toLowerCase();
  for (let i = 0; i < t.length; i++) total += (ROMAN[t[i]] < (ROMAN[t[i + 1]] ?? 0) ? -1 : 1) * ROMAN[t[i]];
  return total;
};

const MIN_BODY = 1200; // a chapter has at least this much text after its heading; a contents-page entry does not

export function findChapters(text: string): Chapter[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const heads: Array<{ number: number; title: string; at: number }> = [];
  let offset = 0;
  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m && line.length < 140) {
      const title = m[3].trim().replace(/\.{2,}.*$/, '').replace(/\s+\d+$/, '').trim();
      heads.push({ number: toNumber(m[2]), title, at: offset });
    }
    offset += line.length + 1;
  }
  // Keep each heading that has a real body; when the same number appears twice (contents, then the chapter), the later one with a body wins.
  const withBody = heads.map((h, i) => ({ ...h, size: (heads[i + 1]?.at ?? text.length) - h.at }));
  const real = withBody.filter((h) => h.size >= MIN_BODY);
  const byNumber = new Map<number, (typeof real)[number]>();
  for (const h of real) { const kept = byNumber.get(h.number); if (!kept || h.size > kept.size) byNumber.set(h.number, h); }
  return [...byNumber.values()].sort((a, b) => a.number - b.number).slice(0, 60).map((h) => ({ number: h.number, title: h.title, size: h.size }));
}

import { MAX_SQUARES, type CoursePlan, type PlannedSquare } from './formats';
import { CHAPTER_SQUARES, chapterSquares } from './chapterSequence';

/** "Chapter 7: Leases". */
export const chapterName = (c: Chapter): string => (c.title ? `Chapter ${c.number}: ${c.title}` : `Chapter ${c.number}`);

/** Six squares for every chapter (the reading, key terms, a worked example, a quiz, an assignment and a chapter exam), within the board's size limit. */
export function chapterPlan(chapters: Chapter[], book: string): CoursePlan {
  const used = chapters.slice(0, Math.floor(MAX_SQUARES / CHAPTER_SQUARES));
  const squares: PlannedSquare[] = [];
  const add = (sq: Omit<PlannedSquare, 'key'>) => squares.push({ key: `s${squares.length + 1}`, ...sq });
  for (const c of used) chapterSquares(chapterName(c), `Chapter ${c.number}`, 'of the textbook').forEach(add);
  return { title: book, summary: 'Every chapter of the book, one unit each: read it, learn its terms, see it worked, then quiz, assignment and chapter exam.', style: "The book's own order, one chapter at a time, with six squares in each chapter.", theme: book, squares };
}
