/**
 * The words of a question or passage as keyword search sees them: lower case, without stop words, reduced to a stem. A leaf module on purpose:
 * the full-text query builder and the keyword ranking both need it, and neither may import the other or the database (that made a cycle).
 */
const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'with', 'what', 'which', 'when', 'where', 'who', 'whom', 'how', 'why', 'does', 'did', 'this', 'that', 'these', 'those', 'from', 'into', 'about', 'have', 'has', 'had', 'can', 'could', 'should', 'would', 'will', 'you', 'your', 'not', 'than', 'then', 'there', 'their', 'them', 'its', 'any', 'all', 'but', 'tell', 'explain', 'describe']);

/** Lowercase word stem: enough to match plural and -ing/-ed variants without a language model. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) { w = w.slice(0, -suffix.length); break; }
  }
  // A final silent e is dropped so "lease" and "leases" (leas) agree.
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function terms(text: string): string[] {
  const out = (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'.-]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu) ?? [])
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w))
    .map(stem);
  return [...new Set(out)];
}
