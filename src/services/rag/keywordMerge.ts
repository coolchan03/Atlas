import type { Scored } from './rankChunks';

/** A passage found only by its words is scored this share of the best meaning-based score: above rankChunks' floor, so it is considered, below the best, so it does not push out a strong semantic hit by itself. */
const KEYWORD_ONLY = 0.7;
/** Each later keyword hit scores a little less than the one before it. */
const STEP = 0.02;

const keyOf = (c: { doc_id: number; position: number }): string => `${c.doc_id}:${c.position}`;

/**
 * Meaning-based search misses what is only said in particular words: a section number, a name, a figure. Passages the keyword index found
 * that the meaning-based list does not have are added to it (a passage in both lists stays as it is: it is already there, and ranking
 * nudges up passages that share the question's words). Pure and deterministic.
 */
export function mergeKeywordHits<T extends Scored>(semantic: T[], keyword: T[], limit: number): T[] {
  const best = semantic.reduce((m, c) => Math.max(m, c.score), 0);
  if (!Number.isFinite(best) || best <= 0 || !keyword.length) return semantic;
  const have = new Set(semantic.map(keyOf));
  const extra = keyword.slice(0, limit).filter((c) => !have.has(keyOf(c)))
    .map((c, i) => ({ ...c, score: best * KEYWORD_ONLY * (1 - STEP * i) }));
  return [...semantic, ...extra].sort((a, b) => b.score - a.score);
}
