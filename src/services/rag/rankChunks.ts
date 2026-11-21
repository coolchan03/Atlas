import type { RagSearchResult } from './database';

/**
 * Ranking for the chunks a question retrieved from a project's documents. The idea and the numbers come from how Project NOMAD
 * (an offline knowledge server) ranks its own retrieval: take more candidates than will be used, nudge up the ones that share the
 * question's words, spread the picks across documents, and drop chunks far weaker than the best one. NOMAD also has a fixed minimum score; that is left out here until it is measured against this app's embedding model, because a floor that is too high would blank the answer's context. Pure and deterministic.
 */
export interface Scored extends RagSearchResult { score: number }

/** A chunk this far below the best one is not about the question. */
const RELATIVE_FLOOR = 0.5;
/** Word-match boosts only apply to chunks that already look relevant, so a chunk cannot win on shared words alone. */
const BOOST_GATE = 0.6;
/** Each further chunk from the same document counts for 15% less than the one before it. */
const DIVERSITY = 0.85;

const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);

/** Score plus up to 10% for the question's words found in the chunk (square root: a quarter of the words is half the boost). */
function boosted(chunk: Scored, queryWords: string[], best: number): number {
  if (!queryWords.length || chunk.score < best * BOOST_GATE) return chunk.score;
  const text = chunk.content.toLowerCase();
  const hit = queryWords.filter((w) => text.includes(w)).length;
  return Math.min(1, chunk.score + Math.sqrt(hit / queryWords.length) * 0.1 * chunk.score);
}

/** The best `topK` chunks for a question from a larger list of scored candidates, in the order they should be shown. */
export function rankChunks(query: string, candidates: Scored[], topK: number): Scored[] {
  if (!candidates.length) return [];
  const best = Math.max(...candidates.map((c) => c.score));
  // No usable scores (nothing is similar to anything): keep the order the caller gave.
  if (!Number.isFinite(best) || best <= 0) return candidates.slice(0, topK);
  const queryWords = [...new Set(words(query))];
  const pool = candidates
    .filter((c) => c.score >= best * RELATIVE_FLOOR)
    .map((c) => ({ ...c, score: boosted(c, queryWords, best) }))
    .sort((a, b) => b.score - a.score);
  // Greedy pick: a chunk's score is cut by how many already chosen came from the same document.
  const chosen: Scored[] = [];
  const perDoc = new Map<number, number>();
  const left = [...pool];
  while (chosen.length < topK && left.length) {
    let pick = 0;
    let pickScore = -1;
    left.forEach((c, i) => {
      const s = c.score * Math.pow(DIVERSITY, perDoc.get(c.doc_id) ?? 0);
      if (s > pickScore) { pick = i; pickScore = s; }
    });
    const [c] = left.splice(pick, 1);
    perDoc.set(c.doc_id, (perDoc.get(c.doc_id) ?? 0) + 1);
    chosen.push(c);
  }
  return chosen;
}
