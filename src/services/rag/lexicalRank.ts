import type { RagSearchResult } from './database';
import { stem, terms } from './terms';

/**
 * Keyword ranking used when meaning-based search is not possible (no embeddings yet, or the embedding model failed).
 * It returns only passages that share the question's words, best first, and nothing at all when none do, so a question
 * about one subject is never answered with the first pages of an unrelated document. Pure and deterministic.
 */
export { stem, terms };

/** Passages that contain enough of the question's terms, most relevant first. An empty list means no relevant evidence. */
export function lexicalRank<T extends RagSearchResult>(query: string, chunks: T[], topK: number): T[] {
  const q = terms(query);
  if (!q.length || !chunks.length) return [];
  const bags = chunks.map((c) => new Set(terms(c.content)));
  // Rarer terms count for more, so a shared "lease" outweighs a shared "company".
  const idf = q.map((t) => Math.log(1 + chunks.length / (1 + bags.filter((b) => b.has(t)).length)));
  const need = q.length === 1 ? 1 : Math.max(2, Math.ceil(q.length * 0.4));
  return chunks
    .map((c, i) => {
      const hit = q.map((t, k) => (bags[i].has(t) ? idf[k] : 0));
      return { c, matched: hit.filter(Boolean).length, s: hit.reduce((a, b) => a + b, 0) };
    })
    .filter((x) => x.matched >= Math.min(need, q.length))
    .sort((a, b) => b.s - a.s || a.c.position - b.c.position)
    .slice(0, topK)
    .map((x) => ({ ...x.c, score: Number((x.s / (q.reduce((a, _t, k) => a + idf[k], 0) || 1)).toFixed(4)) }));
}
