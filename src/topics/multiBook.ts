/**
 * A course from ALL the textbooks in a project, not one. Each book's chapters are read on their own; chapters that are the same subject in
 * different books become one topic (so the lesson is written from every book that covers it), and chapters only one book has are kept, placed
 * beside the topic they follow. The first book (the one with the most chapters) sets the order. Pure, apart from reading the project.
 */
import { findChapters, type Chapter } from './chapters';
import { isEnabled } from '../standards/docRoles';

export interface BookChapters { doc: string; chapters: Array<Pick<Chapter, 'number' | 'title'>> }
export interface MergedTopic { title: string; /** The books that have a chapter on it. */ docs: string[] }

const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'to', 'in', 'on', 'an', 'a', 'basics', 'introduction', 'overview', 'other']);
const words = (t: string): Set<string> => new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.replace(/(ing|es|s)$/, '')).filter((w) => !STOP.has(w)));
const SAME = 0.6;
const same = (a: Set<string>, b: Set<string>): boolean => a.size > 0 && b.size > 0 && [...a].filter((w) => b.has(w)).length / Math.min(a.size, b.size) >= SAME;
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
      if (at >= 0) {
        if (!topics[at].docs.includes(book.doc)) topics[at].docs.push(book.doc);
        after = at;
      } else if (bookIndex === 0) {
        topics.push({ title, docs: [book.doc] });
        after = topics.length - 1;
      } else {
        topics.splice(after + 1, 0, { title, docs: [book.doc] });
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
