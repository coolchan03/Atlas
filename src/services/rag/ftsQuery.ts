import { terms } from './terms';

/** The most words of a question sent to the index: a long question is matched on its rarest words, not all of them. */
const MAX_TERMS = 12;

/**
 * The question as a full-text query: each word (reduced to its stem, as keyword ranking does) as a prefix, joined by OR so a passage
 * with some of the words is found and ranked by how many and how rare. Every word is quoted, so no word of a question can be read as
 * a search operator (AND, NOT, NEAR, a column filter) or break the query. Empty when the question has no usable word. Pure.
 */
export function ftsMatchQuery(question: string): string {
  const words = terms(question).map((t) => t.replace(/["*]/g, '')).filter(Boolean).slice(0, MAX_TERMS);
  return words.map((w) => `"${w}"*`).join(' OR ');
}
