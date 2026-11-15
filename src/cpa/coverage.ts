/**
 * How well the documents in the exam's folder cover each topic on its checklist, so it is clear where lessons are written from your books and
 * where they would fall back on the AI's own memory. A topic is covered when passages that really mention it (most of its words) come from
 * the teaching documents; the law and standards are counted apart. Pure rating first, then the part that searches the project.
 */
import { useCpa } from './store';
import type { ExamCode } from './blueprints';
import { isOutlineDocument } from './outline';
import { isEnabled, isReference, isTeaching } from '../standards/docRoles';
import { supersededEditions } from '../standards/taxSources';

export type Level = 'good' | 'thin' | 'none';
export interface TopicCoverage { topic: string; area: string; level: Level; books: number; passages: number; /** The law or a standard has a passage on it. */ law: boolean }

const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'to', 'in', 'on', 'an', 'a', 'basics', 'other', 'select']);
const words = (t: string): string[] => (t.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.replace(/(ing|es|s)$/, '')).filter((w) => !STOP.has(w));

/** Passages that really are about the topic: most of the topic's words appear in them. */
export function mentions(topic: string, text: string): boolean {
  const need = [...new Set(words(topic))];
  if (!need.length) return false;
  const have = new Set(words(text));
  return need.filter((w) => have.has(w)).length / need.length >= 0.6;
}

/** Good: at least two books and three passages. Thin: some passage. None: nothing in your documents (the AI would write it from its own knowledge). */
export function rate(books: number, passages: number): Level {
  if (books >= 2 && passages >= 3) return 'good';
  return passages >= 1 ? 'thin' : 'none';
}

export async function coverageFor(code: ExamCode): Promise<TopicCoverage[]> {
  const exam = useCpa.getState().exams[code];
  if (!exam?.projectId) return [];
  const { ragService } = require('../services/rag');
  const docs: Array<{ name: string; enabled?: number | boolean }> = await ragService.getDocumentsByProject(exam.projectId);
  const old = supersededEditions(docs.filter(isEnabled).map((d) => d.name));
  const usable = (n: string) => !old.has(n) && !isOutlineDocument(n);
  const out: TopicCoverage[] = [];
  for (const t of exam.topics) {
    const find = async (include: (n: string) => boolean) => {
      const r = await ragService.searchProject(exam.projectId, t.name, { topK: 10, include });
      return (r?.chunks ?? []).filter((c: { content: string }) => mentions(t.name, String(c.content))) as Array<{ name: string }>;
    };
    const teach = await find((n) => usable(n) && isTeaching(n));
    const law = await find((n) => usable(n) && isReference(n));
    const books = new Set(teach.map((c) => c.name)).size;
    out.push({ topic: t.name, area: t.area, level: rate(books, teach.length), books, passages: teach.length, law: law.length > 0 });
  }
  return out;
}
