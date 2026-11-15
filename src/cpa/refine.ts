/**
 * The exam's outline starts rough (the checklist) and gets more detailed from the documents in the CPA Study project: each textbook's chapters
 * that the checklist does not already cover become topics, under the area they fit best. Safe to run again: it only adds what is missing, and
 * a rebuilt board keeps the stars and lessons already earned. Pure parts first (tested without a device), then the part that reads the project.
 */
import { findChapters, type Chapter } from '../topics/chapters';
import { useCpa, type CpaTopic } from './store';
import { isOutlineDocument } from './outline';
import { ensureExamCourse } from './course';
import type { ExamCode } from './blueprints';

const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'to', 'in', 'on', 'an', 'a', 'basics', 'introduction', 'overview', 'other', 'select']);
const words = (t: string): Set<string> => new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.replace(/(ing|es|s)$/, '')).filter((w) => !STOP.has(w)));
const shared = (a: Set<string>, b: Set<string>): number => [...a].filter((w) => b.has(w)).length;
const SKIP = /^(preface|index|appendix|glossary|answers?|solutions?|contents|about|foreword)\b/i;

export interface BookChapters { doc: string; chapters: Array<Pick<Chapter, 'number' | 'title'>> }
export interface Addition { area: string; name: string; from: string }

/** The topic a chapter title makes: the title, tidied, or null when it is not a subject (a preface, an index). */
const topicName = (title: string): string | null => {
  const t = title.replace(/^[\s:.\-–—]+/, '').trim().slice(0, 70);
  return t.length >= 4 && !SKIP.test(t) ? t : null;
};

/**
 * The topics to add from the books' chapters. A book counts for this exam when its chapters share words with the checklist; its chapters
 * that the checklist already covers add nothing; each of the others goes under the area it fits best (else the area of the chapter before it).
 */
export function additionsFrom(topics: CpaTopic[], books: BookChapters[]): Addition[] {
  const areas = [...new Set(topics.map((t) => t.area))];
  if (!areas.length) return [];
  const areaWords = new Map(areas.map((a) => [a, words(`${a} ${topics.filter((t) => t.area === a).map((t) => t.name).join(' ')}`)]));
  const have = topics.map((t) => words(t.name));
  const taken = new Set(topics.map((t) => t.name.toLowerCase()));
  const out: Addition[] = [];
  for (const book of books) {
    const named = book.chapters.map((c) => ({ c, name: topicName(c.title) })).filter((x): x is { c: BookChapters['chapters'][number]; name: string } => !!x.name);
    // A book is for this exam when enough of its chapter titles touch the checklist.
    const touching = named.filter((x) => [...areaWords.values()].some((w) => shared(words(x.name), w) > 0)).length;
    if (touching < Math.min(3, named.length) || touching === 0) continue;
    let last = areas[0];
    for (const { name } of named) {
      const w = words(name);
      const covered = have.some((h) => h.size > 0 && w.size > 0 && shared(w, h) / Math.min(w.size, h.size) >= 0.6);
      let best = { area: '', score: 0 };
      areaWords.forEach((aw, area) => { const sc = shared(w, aw); if (sc > best.score) best = { area, score: sc }; });
      if (best.score > 0) last = best.area;
      if (covered || taken.has(name.toLowerCase())) continue;
      taken.add(name.toLowerCase());
      out.push({ area: best.score > 0 ? best.area : last, name, from: book.doc });
    }
  }
  return out.slice(0, 60);
}

/** The chapters of each document in the project (question banks and the exam blueprint are not books). */
async function chaptersOf(projectId: string): Promise<BookChapters[]> {
  const { ragService } = require('../services/rag');
  const { looksLikeQuestions } = require('../study/bookQuestions');
  const out: BookChapters[] = [];
  for (const doc of await ragService.getDocumentsByProject(projectId)) {
    if (isOutlineDocument(String(doc.name))) continue;
    const text = (await ragService.getDocumentChunks(doc.id)).map((c: { content: string }) => String(c.content).replace(/^\(p\. \d+\)\s*/, '')).join('\n');
    if (looksLikeQuestions(text.slice(0, 4000))) continue;
    const chapters = findChapters(text);
    if (chapters.length >= 3) out.push({ doc: String(doc.name), chapters });
  }
  return out;
}

/**
 * Makes the outline more detailed from the documents. Returns how many topics were added; when there are any, the board is rebuilt so its
 * squares match (what was played and written is kept).
 */
export async function refineOutline(code: ExamCode): Promise<number> {
  const exam = useCpa.getState().exams[code];
  if (!exam?.projectId) return 0;
  let added = 0;
  try {
    const adds = additionsFrom(exam.topics, await chaptersOf(exam.projectId));
    adds.forEach((a) => useCpa.getState().addTopic(code, a.area, a.name));
    added = adds.length;
  } catch { return 0; }
  if (added && useCpa.getState().exams[code]?.courseId) ensureExamCourse(code, true);
  return added;
}
