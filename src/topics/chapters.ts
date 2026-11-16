/**
 * The chapters of a textbook, found in its text: lines such as "Chapter 7: Leases", "CHAPTER 7 Leases" or "Unit 3 - Ratios". A real chapter
 * heading is followed by pages of text; the same words in a table of contents are followed by the next entry straight away, so those are
 * dropped. A course can then be built with one unit per chapter, each ending in a test of that chapter. Pure, so it is tested without a device.
 */
export interface Chapter { number: number; title: string; /** How much text follows the heading before the next chapter. */ size: number; /** The first lines of the chapter, for naming it. */ lead?: string; /** What the chapter is mainly about in one to three words ("Cash", "Liabilities"), when it has been worked out. */ subject?: string }

const HEADING = /^\s*(?:\(p\. \d+\)\s*)?(chapter|unit|module|lesson|part)\s+(\d{1,3}|[ivxlc]{1,6})\b[\s:.\-–—]*(.{0,90})$/i;
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
const toNumber = (token: string): number => {
  if (/^\d+$/.test(token)) return Number(token);
  let total = 0; const t = token.toLowerCase();
  for (let i = 0; i < t.length; i++) total += (ROMAN[t[i]] < (ROMAN[t[i + 1]] ?? 0) ? -1 : 1) * ROMAN[t[i]];
  return total;
};

const MIN_BODY = 1200; // a chapter has at least this much text after its heading; a contents-page entry does not

/** The chapter's title on a line after its number: the first short line without a full stop (a title is not a sentence), within the next few lines. */
function titleBelow(lines: string[], from: number): string {
  for (let i = from; i < Math.min(lines.length, from + 4); i++) {
    const t = lines[i].replace(/^\s*\(p\. \d+\)\s*/, '').trim();
    if (!t) continue;
    if (HEADING.test(t) || t.length < 3 || t.length > 90 || /[.!?]$/.test(t) || /^\d+$/.test(t)) return '';
    return t.replace(/\.{2,}.*$/, '').replace(/\s+\d+$/, '').trim();
  }
  return '';
}

export function findChapters(text: string): Chapter[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const heads: Array<{ number: number; title: string; at: number }> = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = HEADING.exec(line);
    if (m && line.length < 140) {
      let title = m[3].trim().replace(/\.{2,}.*$/, '').replace(/\s+\d+$/, '').trim();
      // Many books put the title on the line after "Chapter 7": take it from there.
      if (!title) title = titleBelow(lines, i + 1);
      heads.push({ number: toNumber(m[2]), title, at: offset });
    }
    offset += line.length + 1;
  }
  // Keep each heading that has a real body; when the same number appears twice (contents, then the chapter), the later one with a body wins.
  const withBody = heads.map((h, i) => ({ ...h, size: (heads[i + 1]?.at ?? text.length) - h.at }));
  const real = withBody.filter((h) => h.size >= MIN_BODY);
  const byNumber = new Map<number, (typeof real)[number]>();
  for (const h of real) { const kept = byNumber.get(h.number); if (!kept || h.size > kept.size) byNumber.set(h.number, h); }
  const clean = (t: string) => t.replace(/\(p\. \d+\)/g, ' ').replace(/\s+/g, ' ').trim();
  return [...byNumber.values()].sort((a, b) => a.number - b.number).slice(0, 60).map((h) => ({ number: h.number, title: h.title, size: h.size, lead: clean(text.slice(h.at, h.at + 600)).slice(0, 320) }));
}

const LEAD_IN = /^(?:assume|suppose|consider|imagine|understanding|introduction to|an? introduction to|an? overview of|overview of|learning objectives?(?: for)?|the basics of|about)\s+(?:that\s+)?(?:the\s+|an?\s+)?/i;
const CLAUSE = /\s+(?:chooses?|decides?|that|which|who|to|as|for|when|where|how|why|is|are|was|were|can|will|would|should|using|with|and|of|in|on)\s+|[,;:(–—]/i;
const titleCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * What a chapter is mainly about, in a few words, taken from its heading: "Assume the County chooses to report the Television Reception
 * Improvement Fund as a special revenue fund" is about the County, "Cash and Cash Equivalents" stays as it is. A short heading is kept
 * whole; a long one is cut at its first clause. The AI names chapters better (see nameChapters); this is what is used when it cannot.
 */
export function shortSubject(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '');
  if (!t) return '';
  if (t.split(' ').length <= 4 && t.length <= 32) return titleCase(t);
  const stripped = t.replace(LEAD_IN, '');
  const first = stripped.split(CLAUSE)[0].trim();
  const words = (first.length >= 3 ? first : stripped).split(' ').filter(Boolean).slice(0, 4);
  return titleCase(words.join(' '));
}

/** The prompt that asks the AI for each chapter's subject, and a strict reader of its answer. */
export function subjectPrompt(chapters: Chapter[]): { system: string; user: string } {
  const list = chapters.map((c, i) => `${i + 1}. ${c.title || '(untitled)'}${c.lead ? ` — starts: ${c.lead.slice(0, 160)}` : ''}`).join('\n');
  return {
    system: 'You name the chapters of a textbook by their main subject. Reply with ONLY JSON.',
    user: `For each chapter below give the main subject in one to three words, like a table of contents entry: "Cash", "Liabilities", "Governmental funds", "Photosynthesis". Not a sentence, no chapter number.\n${list}\n\nReply with ONLY a JSON array of ${chapters.length} strings, in the same order.`,
  };
}
export function parseSubjects(raw: string, count: number): string[] | null {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || arr.length !== count) return null;
    return arr.map((x) => String(x ?? '').replace(/^\s*\d+[.)\-–:]\s*/, '').replace(/["*]/g, '').trim().slice(0, 32));
  } catch { return null; }
}

import { MAX_SQUARES, type CoursePlan, type PlannedSquare } from './formats';
import { CHAPTER_SQUARES, deepChapter } from './chapterSequence';

/** "7 – Leases": the number, then what the chapter is mainly about (not the book's long heading). */
export const chapterName = (c: Chapter): string => {
  const subject = (c.subject?.trim() || shortSubject(c.title));
  return subject ? `${c.number} – ${subject}` : `Chapter ${c.number}`;
};

/** How a chapter or square title written the old way ("Chapter 1: Assume the County chooses...: key terms") reads now ("1 – County: key terms"). Anything else is unchanged. */
export function friendlyTitle(text: string): string {
  const m = /^(?:chapter|unit|module|lesson|part)\s+(\d{1,3})\s*[:.\-–—]\s*(.+?)((?::\s*(?:key terms|worked example|quiz|assignment|chapter exam|true or false|fill the blanks|case study|type the answer|read and answer|match|sort|calculations)))?$/i.exec(text.trim());
  if (!m) return text;
  const short = shortSubject(m[2]);
  return short ? `${m[1]} – ${short}${m[3] ?? ''}` : text;
}

/** Six squares for every chapter (the reading, key terms, a worked example, a quiz, an assignment and a chapter exam), within the board's size limit. */
export function chapterPlan(chapters: Chapter[], book: string, manyBooks = false): CoursePlan {
  const used = chapters.slice(0, Math.floor(MAX_SQUARES / CHAPTER_SQUARES));
  const squares: PlannedSquare[] = [];
  const add = (sq: Omit<PlannedSquare, 'key'>) => squares.push({ key: `s${squares.length + 1}`, ...sq });
  // The unit is named for what the chapter is mainly about ("7 – Leases"), not just its number; passages are still matched on the book's full heading.
  const about = manyBooks ? 'from all the textbooks in the project' : 'of the textbook';
  // Passages and questions are matched on the book's full heading (`topic`), while the board shows the short name.
  for (const c of used) deepChapter({ name: chapterName(c), unit: chapterName(c), about, topic: c.title || undefined }, CHAPTER_SQUARES).forEach(add);
  return { title: book, summary: manyBooks ? 'Every chapter of every textbook, with the same subject in different books made one unit: read it, learn its terms, see it worked, then quiz, assignment and chapter exam.' : 'Every chapter of the book, one unit each: read it, learn its terms, see it worked, then quiz, assignment and chapter exam.', style: "The book's own order, one chapter at a time, with six squares in each chapter.", theme: book, squares };
}
