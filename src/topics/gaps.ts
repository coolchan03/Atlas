/**
 * A hint, not a verdict: words that carry weight in the passages a lesson was written from (they come up again and again) but that the
 * lesson never uses. A reader can see what the book stressed and the lesson left out. Pure: no model and no search, so it works offline.
 */
const COMMON = new Set(['because', 'between', 'through', 'however', 'therefore', 'although', 'another', 'without', 'during', 'before', 'should', 'would', 'could', 'which', 'their', 'there', 'these', 'those', 'about', 'under', 'within', 'being', 'other', 'where', 'while', 'every', 'always', 'usually', 'example', 'following', 'including', 'generally', 'amount', 'chapter', 'section', 'figure', 'table', 'different', 'similar', 'certain', 'general', 'number', 'related', 'required', 'whether', 'result', 'results', 'making', 'called']);
const words = (text: string): string[] => (text.toLowerCase().match(/[a-z][a-z-]{5,}/g) ?? []).filter((w) => !COMMON.has(w));
/** One root for a word and its plural or ending (process and processes agree; a word that ends in ss keeps it). */
const stem = (w: string): string => w.replace(/(ing|ed|ly)$/, '').replace(/(sses|xes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/ies$/, 'y').replace(/(?<![su])s$/, '').slice(0, 7);

export function missingTerms(lesson: string, passages: string[], limit = 8): string[] {
  const used = new Set(words(lesson).map(stem));
  const count = new Map<string, { word: string; n: number }>();
  for (const w of words(passages.join('\n'))) {
    const key = stem(w);
    const seen = count.get(key);
    if (seen) seen.n += 1; else count.set(key, { word: w, n: 1 });
  }
  return [...count.entries()].filter(([key, v]) => v.n >= 3 && !used.has(key)).sort((a, b) => b[1].n - a[1].n).slice(0, limit).map(([, v]) => v.word);
}
