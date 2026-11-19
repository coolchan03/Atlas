/**
 * Two views of what a course covers, kept side by side: the exam blueprint's objectives, and every chapter of every textbook. Each
 * objective lists the book chapters that match its words, and each chapter says which objectives it serves; objectives no chapter
 * matches (gaps), and chapters matching no objective (material only that book has), are listed rather than dropped. A match here is a
 * title-level mapping, not proof that the material was taught. Pure.
 */
import { mentions } from './coverage';
import type { ChapterRef } from '../topics/multiBook';

export interface Objective { id: string; name: string; area?: string }
export interface ObjectiveLink { objective: Objective; chapters: ChapterRef[]; books: string[] }
export interface ChapterMap {
  links: ObjectiveLink[];
  /** Objectives no chapter of any book matches: the lesson would rest on the AI's own knowledge or the standards alone. */
  gaps: Objective[];
  /** Chapters that match no objective: kept as units of their own. */
  unmapped: ChapterRef[];
}

const label = (c: ChapterRef) => (c.title ? c.title : `Chapter ${c.number}`);

export function mapObjectives(objectives: Objective[], chapters: ChapterRef[]): ChapterMap {
  const links = objectives.map((objective) => {
    const hit = chapters.filter((c) => c.title.trim() && (mentions(objective.name, label(c)) || mentions(label(c), objective.name)));
    return { objective, chapters: hit, books: [...new Set(hit.map((c) => c.doc))] };
  });
  const served = new Set(links.flatMap((l) => l.chapters.map((c) => `${c.doc}#${c.number}`)));
  return {
    links,
    gaps: links.filter((l) => !l.chapters.length).map((l) => l.objective),
    unmapped: chapters.filter((c) => !served.has(`${c.doc}#${c.number}`)),
  };
}

/** One line per objective for a board note: which books cover it, or that none does. */
export function describeMap(map: ChapterMap): string[] {
  return map.links.map((l) => (l.chapters.length
    ? `${l.objective.name}: ${l.books.length} book${l.books.length === 1 ? '' : 's'} (${l.chapters.map((c) => `${c.doc.replace(/\.[A-Za-z0-9]{2,4}$/, '')} ch. ${c.number}`).join(', ')})`
    : `${l.objective.name}: no chapter in your books matches this`));
}
