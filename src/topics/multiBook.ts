/**
 * A course from ALL the textbooks in a project, not one. Each book's chapters are read on their own; chapters that are the same subject in
 * different books become one topic (so the lesson is written from every book that covers it), and chapters only one book has are kept, placed
 * beside the topic they follow. The first book (the one with the most chapters) sets the order. Pure, apart from reading the project.
 */
import { findChapters, type Chapter } from './chapters';
import { isEnabled } from '../standards/docRoles';

export interface BookChapters { doc: string; chapters: Array<Pick<Chapter, 'number' | 'title'>> }
/** One chapter of one book, kept whatever happens to the topic it is grouped under. */
export interface ChapterRef { doc: string; number: number; title: string }
export interface MergedTopic {
  title: string;
  /** The books that have a chapter on it. */
  docs: string[];
  /** Every book chapter behind the topic, by book and chapter number, so nothing is lost when chapters are grouped. */
  members: ChapterRef[];
}

const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'to', 'in', 'on', 'an', 'a', 'basics', 'introduction', 'overview', 'other']);
const words = (t: string): Set<string> => new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.replace(/(ing|es|s)$/, '').replace(/e$/, '')).filter((w) => !STOP.has(w)));
/**
 * Two chapter titles are the same subject only when they say the same thing: the same words, or most of them with at least two in common
 * (counted against the longer title, so "Leases" is not "Leases and sale-leasebacks", nor "Income taxes" "Income statement"). A chapter
 * that is not clearly another book's chapter stays its own unit, beside the nearest one, rather than disappearing into it.
 */
const SAME = 0.75;
const same = (a: Set<string>, b: Set<string>): boolean => {
  if (!a.size || !b.size) return false;
  const shared = [...a].filter((w) => b.has(w)).length;
  if (shared === a.size && shared === b.size) return true;
  return shared >= 2 && shared / Math.max(a.size, b.size) >= SAME;
};
const SKIP = /^(preface|index|appendix|glossary|answers?|solutions?|contents|about|foreword)\b/i;

export function mergeBooks(books: BookChapters[]): MergedTopic[] {
  const ordered = [...books].sort((a, b) => b.chapters.length - a.chapters.length);
  const topics: MergedTopic[] = [];
  const keyOf = (t: MergedTopic) => words(t.title);
  ordered.forEach((book, bookIndex) => {
    let after = -1; // where the book's previous chapter landed, so a chapter only this book has goes beside it
    for (const c of book.chapters) {
      // A chapter whose title could not be found keeps its number, so no chapter of a book is dropped.
      const untitled = !c.title.trim();
      const title = untitled ? `Chapter ${c.number} of ${book.doc.replace(/\.[A-Za-z0-9]{2,4}$/, '').slice(0, 30)}` : c.title.trim();
      if (title.length < 4 || SKIP.test(title)) continue;
      const w = untitled ? new Set<string>() : words(title); // two books' untitled "Chapter 7" are not the same subject
      // Only a topic from ANOTHER book is the same subject: two chapters of one book are two units, however alike their titles.
      const at = topics.findIndex((t) => !t.docs.includes(book.doc) && same(w, keyOf(t)));
      const member: ChapterRef = { doc: book.doc, number: c.number, title: untitled ? '' : title };
      if (at >= 0) {
        topics[at].docs.push(book.doc);
        topics[at].members.push(member);
        after = at;
      } else if (bookIndex === 0) {
        topics.push({ title, docs: [book.doc], members: [member] });
        after = topics.length - 1;
      } else {
        topics.splice(after + 1, 0, { title, docs: [book.doc], members: [member] });
        after += 1;
      }
    }
  });
  return topics;
}

/** The chapters of each document of a project (a question bank is not a book). A book needs at least three chapters to count. */
export async function bookChapters(projectId: string, skip: (docName: string) => boolean = () => false): Promise<BookChapters[]> {
  const { ragService } = require('../services/rag');
  const { looksLikeQuestions } = require('../study/bookQuestions');
  const out: BookChapters[] = [];
  for (const doc of await ragService.getDocumentsInScope(projectId)) {
    if (!isEnabled(doc) || skip(String(doc.name))) continue;
    const text = (await ragService.getDocumentChunks(doc.id)).map((c: { content: string }) => String(c.content).replace(/^\(p\. \d+\)\s*/, '')).join('\n');
    if (looksLikeQuestions(text.slice(0, 4000))) continue;
    const chapters = findChapters(text);
    if (chapters.length >= 3) out.push({ doc: String(doc.name), chapters });
  }
  return out;
}

/** The merged topics as chapters (numbered in order) for the course plan. */
export const asChapters = (topics: MergedTopic[]): Chapter[] => topics.map((t, i) => ({ number: i + 1, title: t.title, size: 0 }));
