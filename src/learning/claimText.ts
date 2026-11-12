/**
 * Plain text checks on claims: how alike two claims are, whether a cited passage contains the numbers a claim states,
 * and whether a new claim repeats or contradicts one already known. Pure and deterministic, so it is tested without a model.
 * These checks find problems; they do not prove a claim true.
 */

const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'that', 'this', 'with', 'from', 'has', 'have', 'had', 'its', 'but',
  'not', 'can', 'will', 'may', 'than', 'then', 'into', 'also', 'each', 'any', 'all', 'one', 'who', 'what', 'when', 'where', 'which',
  'their', 'there', 'they', 'them', 'been', 'being', 'such', 'only', 'more', 'most', 'some', 'other', 'about', 'over', 'under']);
const NEGATION = /\b(?:not|no|never|cannot|can't|isn't|aren't|doesn't|don't|didn't|without|neither|nor)\b/i;

/** Plural "s" dropped, so "minute" and "minutes" count as the same word. */
const stem = (w: string) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** The meaningful lower-case words of a text. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};
const UNITS = 'minutes?|hours?|days?|weeks?|months?|years?|seconds?|inch(?:es)?|foot|feet|miles?|dollars?|percent|grams?|kg|liters?|cups?|times?|steps?|points?';

/** Number words written out become digits. "one" counts only before a unit, because it is also an ordinary pronoun. */
function wordsToDigits(text: string): string {
  return text
    .replace(new RegExp(`\\bone(?=\\s+(?:${UNITS})\\b)`, 'gi'), '1')
    .replace(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi'), (w) => String(NUMBER_WORDS[w.toLowerCase()]));
}

/** 0 to 1: how much of the smaller claim's words the other one shares. */
export function similarity(a: string, b: string): number {
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  x.forEach((w) => { if (y.has(w)) shared += 1; });
  return shared / Math.min(x.size, y.size);
}

/** Numbers as written in a text, with thousands commas removed ("1,200" and "1200" match) and trailing zeros trimmed. */
export function numbersIn(text: string): string[] {
  const found = wordsToDigits(text).replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found.map((n) => String(Number(n))))];
}

/** A cited passage must share at least this share of a claim's words. Low on purpose: a paraphrase is fine, an unrelated passage is not. */
const MIN_OVERLAP = 0.2;

export interface SupportCheck {
  /** true: the passages contain what the claim states. false: a stated number is missing from them. null: nothing to check against. */
  supported: boolean | null;
  missingNumbers: string[];
  /** Share of the claim's words found in the passages. */
  overlap: number;
}

/** Does the cited text contain the numbers the claim states, and enough of its words? A relevant-looking source is not enough. */
export function checkSupport(claim: string, passages: string[]): SupportCheck {
  const text = passages.filter((p) => p.trim()).join(' ');
  if (!text) return { supported: null, missingNumbers: [], overlap: 0 };
  const have = new Set(numbersIn(text));
  const missingNumbers = numbersIn(claim.replace(/\[\d+\]/g, '')).filter((n) => !have.has(n));
  const claimWords = new Set(tokens(claim));
  const textWords = new Set(tokens(text));
  let hit = 0;
  claimWords.forEach((w) => { if (textWords.has(w)) hit += 1; });
  const overlap = claimWords.size ? hit / claimWords.size : 0;
  return { supported: missingNumbers.length === 0 && overlap >= MIN_OVERLAP, missingNumbers, overlap };
}

export type Relation = 'new' | 'duplicate' | 'contradicts';
export interface Comparison { relation: Relation; matchId?: string; reason?: string }

const DUPLICATE_AT = 0.85;
const RELATED_AT = 0.5;

/** The same subject with a different number or an opposite statement. */
function conflict(a: string, b: string): string | undefined {
  const na = numbersIn(a);
  const nb = numbersIn(b);
  const differs = na.length > 0 && nb.length > 0 && na.some((n) => !nb.includes(n)) && nb.some((n) => !na.includes(n));
  if (differs) return `States different numbers (${na.join(', ')} against ${nb.join(', ')})`;
  if (NEGATION.test(a) !== NEGATION.test(b)) return 'Says the opposite of a known claim';
  return undefined;
}

/** Is this claim new, a repeat of a known one, or in conflict with one? The closest known claim decides. */
export function compareClaim(claim: string, known: Array<{ id: string; text: string }>): Comparison {
  let best: { id: string; score: number; text: string } | null = null;
  for (const k of known) {
    const score = similarity(claim, k.text);
    if (score >= RELATED_AT && (!best || score > best.score)) best = { id: k.id, score, text: k.text };
  }
  if (!best) return { relation: 'new' };
  const reason = conflict(claim, best.text);
  if (reason) return { relation: 'contradicts', matchId: best.id, reason };
  return best.score >= DUPLICATE_AT ? { relation: 'duplicate', matchId: best.id } : { relation: 'new', matchId: best.id };
}

/** The numbered source whose passage shares the most words with a claim, if any shares enough to be worth a reviewer's look. */
export function closestPassage(claim: string, passages: Array<{ n: number; passage?: string }>): number | undefined {
  let best: { n: number; score: number } | undefined;
  for (const p of passages) {
    if (!p.passage?.trim()) continue;
    const score = similarity(claim, p.passage);
    if (score >= 0.5 && (!best || score > best.score)) best = { n: p.n, score };
  }
  return best?.n;
}

/** Sentences of a report's answer, ready to be stored as separate claims, each keeping its [n] citation markers. No regex lookbehind: older Hermes builds lack it. */
export function claimSentences(text: string): string[] {
  const section = text.split(/^\s*(?:REASONING|UNSURE)\s*:/im)[0];
  const stripped = section.replace(/\bKEY POINTS\s*:/gi, '\nKEY POINTS:').replace(/^\s*(?:ANSWER|KEY POINTS)\s*:\s*/gim, '');
  const out: string[] = [];
  for (const line of stripped.split('\n')) {
    for (const sentence of line.match(/[^.!?]+(?:[.!?]+(?:\s*\[\d+\])*(?=\s|$)|$)/g) ?? []) {
      const clean = sentence.replace(/^\s*[-*\d.)]+\s*/, '').trim();
      if (clean.length >= 16 && clean.length <= 1200 && !/^(?:none|unknown|unsure)$/i.test(clean)) out.push(clean);
    }
  }
  return [...new Set(out)].slice(0, 12);
}
