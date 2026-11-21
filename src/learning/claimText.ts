/**
 * Plain text checks on claims: how alike two claims are, whether a cited passage contains the numbers a claim states,
 * and whether a new claim repeats or contradicts one already known. Pure and deterministic, so it is tested without a model.
 * These checks find problems; they do not prove a claim true.
 */

const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'that', 'this', 'with', 'from', 'has', 'have', 'had', 'its', 'but',
  'not', 'can', 'will', 'may', 'than', 'then', 'into', 'also', 'each', 'any', 'all', 'one', 'who', 'what', 'when', 'where', 'which',
  'their', 'there', 'they', 'them', 'been', 'being', 'such', 'only', 'more', 'most', 'some', 'other', 'about', 'over', 'under']);

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
export function wordsToDigits(text: string): string {
  return text
    .replace(new RegExp(`\\bone(?=\\s+(?:${UNITS})\\b)`, 'gi'), '1')
    .replace(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi'), (w) => String(NUMBER_WORDS[w.toLowerCase()]));
}

/** The years (1990 to 2099) a text names, such as the tax years a rule applies to. */
export function yearsOf(text: string): number[] {
  return [...new Set((text.match(/\b(?:19[9]\d|20\d\d)\b/g) ?? []).map(Number))].sort((a, b) => a - b);
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

/**
 * Numbers as written in a text, with thousands commas removed ("1,200" and "1200" match) and trailing zeros trimmed.
 * A minus sign is kept ("-5", "-$1,200", "$-1,200", "−5%") and so is an accounting loss written in brackets ("($1,200)", "(1,200.50)"), because a
 * negative figure is a different fact from the same figure without its sign. A hyphen between numbers ("5-10", "2024-05-01") is a range or a date, not a sign.
 */
export function numbersIn(text: string): string[] {
  const source = wordsToDigits(text).replace(/\b(?:negative|minus)\s+(?=\$?\s?\d)/gi, '-'); // "negative 5000" and "minus 5000" are -5000
  const found: string[] = [];
  const re = /(\()?\s?([-\u2212])?\s?(\$)?\s?([-\u2212])?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?%)?(\s?\))?/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const value = Number(`${m[5].replace(/,/g, '')}${m[6] ?? ''}`);
    const start = m.index + (m[0].length - m[0].trimStart().length); // the first visible character, not the space in front of it
    const before = start === 0 ? ' ' : source[start - 1];
    const signAllowed = !/[\d.]/.test(before) && !/[A-Za-z]/.test(before); // "5-10" and "Q3-2024" are not negative
    const dashed = !!(m[2] || m[4]) && signAllowed && (!m[1] || !!m[3]);
    const bracketed = !!m[1] && !!m[8] && (!!m[3] || m[5].includes(',') || !!m[6] || !!m[7]); // "(2)" is a clause number, "($5)" and "(1,200)" are losses
    found.push(value !== 0 && (dashed || bracketed) ? `-${value}` : String(value));
  }
  return [...new Set(found)];
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

/** Words of a text as written (lower case, apostrophes kept). Stop words are NOT removed: "not" and "more" decide what a claim means. */
const rawWords = (text: string): string[] => (text.toLowerCase().replace(/[\u2019]/g, "'").match(/[\p{L}\p{N}']+/gu) ?? []);
const isNegator = (w: string): boolean => /^(?:not|no|never|cannot|without|neither|nor|none|nothing)$/.test(w) || w.endsWith("n't");

/** Pairs of opposite words. The first pattern is the "up" side, the second the "down" side. A claim that says "gain" and an answer that says "loss" disagree. */
const OPPOSITES: Array<[RegExp, RegExp]> = [
  [/^(?:increas\w*|rise|rises|rose|risen|rising|grow\w*|higher|greater|larger|above|exceed\w*)$/, /^(?:decreas\w*|reduc\w*|declin\w*|fall|falls|fell|fallen|falling|drop\w*|lower|smaller|fewer|below|shrink\w*|shrank)$/],
  [/^(?:gain\w*|profit\w*|surplus|earned)$/, /^(?:loss|losses|lost|deficit)$/],
  [/^(?:before|prior|earlier|preceding)$/, /^(?:after|following|later|subsequent)$/],
  [/^(?:allow\w*|permit\w*|legal|lawful|eligible|deductible|taxable|required|mandatory)$/, /^(?:prohibit\w*|forbid\w*|forbidden|illegal|unlawful|ineligible|nondeductible|nontaxable|optional|voluntary)$/],
  [/^(?:true|correct|valid)$/, /^(?:false|incorrect|invalid)$/],
  [/^(?:always|every)$/, /^(?:never)$/],
  [/^(?:maximum|max|most|highest|upper|ceiling)$/, /^(?:minimum|min|least|lowest|floor)$/],
  [/^(?:debit|debits|debited)$/, /^(?:credit|credits|credited)$/],
  [/^(?:asset|assets)$/, /^(?:liability|liabilities)$/],
  [/^(?:positive)$/, /^(?:negative)$/],
  [/^(?:long|longer)$/, /^(?:short|shorter)$/],
  [/^(?:inflow|inflows|receipt|receipts)$/, /^(?:outflow|outflows|payment|payments)$/],
];
const oppositeSide = (w: string): { pair: number; side: 1 | -1 } | undefined => {
  for (let i = 0; i < OPPOSITES.length; i += 1) {
    if (OPPOSITES[i][0].test(w)) return { pair: i, side: 1 };
    if (OPPOSITES[i][1].test(w)) return { pair: i, side: -1 };
  }
  return undefined;
};

interface Orientation { negated: boolean; pairs: Map<number, 1 | -1 | 0> }
/** Whether a text is negated, and which side of each opposite pair it takes (0 when it uses both sides, which says nothing). */
function orientationOf(text: string): Orientation {
  const words = rawWords(text);
  // Any negation counts, not an odd number of them: "was not signed and did not end" is one negated claim, not a double negative.
  const negated = words.some(isNegator);
  const pairs = new Map<number, 1 | -1 | 0>();
  for (const w of words) {
    const o = oppositeSide(w);
    if (!o) continue;
    const prior = pairs.get(o.pair);
    pairs.set(o.pair, prior === undefined || prior === o.side ? o.side : 0);
  }
  return { negated, pairs };
}

/**
 * True when two statements about the same thing say opposite things: one is negated and the other is not ("can" / "cannot"), or they take
 * opposite sides of a pair of opposites ("gain" / "loss", "at least" / "at most"). The two combine, so "is not required" and "is optional" agree.
 */
export function opposes(a: string, b: string): boolean {
  const x = orientationOf(a);
  const y = orientationOf(b);
  let shared = false;
  for (const [pair, sideA] of x.pairs) {
    const sideB = y.pairs.get(pair);
    if (!sideA || !sideB) continue;
    shared = true;
    if ((x.negated ? -sideA : sideA) !== (y.negated ? -sideB : sideB)) return true;
  }
  return !shared && x.negated !== y.negated;
}

/** Units a figure can carry, each written one way, so "5 miles" and "5 mile" agree and "5 km" is a different fact. */
const UNIT_FORMS: Array<[RegExp, string]> = [
  [/^(?:%|percent|per\s?cent)$/, '%'], [/^(?:dollars?|usd|\$)$/, 'usd'], [/^(?:minutes?|mins?)$/, 'minute'], [/^(?:hours?|hrs?)$/, 'hour'],
  [/^(?:days?)$/, 'day'], [/^(?:weeks?)$/, 'week'], [/^(?:months?)$/, 'month'], [/^(?:years?|yrs?)$/, 'year'], [/^(?:seconds?|secs?)$/, 'second'],
  [/^(?:miles?|mi)$/, 'mile'], [/^(?:km|kilomet(?:er|re)s?)$/, 'km'], [/^(?:meters?|metres?|m)$/, 'm'], [/^(?:feet|foot|ft)$/, 'ft'], [/^(?:inch(?:es)?|in)$/, 'inch'],
  [/^(?:kg|kilograms?)$/, 'kg'], [/^(?:grams?|g)$/, 'g'], [/^(?:pounds?|lbs?)$/, 'lb'], [/^(?:ounces?|oz)$/, 'oz'], [/^(?:liters?|litres?|l)$/, 'l'],
  [/^(?:mph)$/, 'mph'], [/^(?:kph|km\/h)$/, 'kph'],
];
const canonicalUnit = (w: string): string | undefined => UNIT_FORMS.find(([re]) => re.test(w))?.[1];

/** Each figure with the unit written right after it ("5 miles" gives 5 -> mile). A figure with no unit is left out. */
function quantitiesIn(text: string): Array<{ n: string; unit: string }> {
  const out: Array<{ n: string; unit: string }> = [];
  const re = /(-?\d[\d,]*(?:\.\d+)?)\s?(%|[A-Za-z]+(?:\/h)?)/g;
  const source = wordsToDigits(text);
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const unit = canonicalUnit(m[2].toLowerCase());
    if (unit) out.push({ n: String(Number(m[1].replace(/,/g, ''))), unit });
  }
  return out;
}

/** The same figure given in a different unit than the claim uses ("5 km" against "5 miles"). */
export function unitConflict(claim: string, answer: string): boolean {
  const theirs = quantitiesIn(answer);
  return quantitiesIn(claim).some((q) => {
    const sameNumber = theirs.filter((t) => t.n === q.n);
    return sameNumber.length > 0 && !sameNumber.some((t) => t.unit === q.unit);
  });
}

/** Words that make a statement conditional or give an exception to it. */
const CONDITION = /\b(?:unless|except|exception|exceptions|only if|only when|provided that|as long as|otherwise|if)\b/i;

type Relation = 'new' | 'duplicate' | 'contradicts';
export interface Comparison { relation: Relation; matchId?: string; reason?: string }

const DUPLICATE_AT = 0.85;
const RELATED_AT = 0.5;

/** A year, such as a tax year. Claims about different years are different versions of a rule, not disagreements. */
const isYear = (n: string) => /^(?:19|20)\d\d$/.test(n);
const POLARITY = new Set(['never', 'cannot', 'without', 'neither', 'nor']);
/** The words of a claim that name its subject: numbers, negations and opposite words left out (an opposite pair counts as one word), so "$13,850" against "$14,600" or "gain" against "loss" still reads as the same subject. */
const subjectWords = (t: string) => rawWords(t)
  .map((w) => { const o = oppositeSide(w); return o ? `~${o.pair}` : w; })
  .filter((w) => w.startsWith('~') || (w.length >= 3 && !STOP.has(w) && !isNegator(w) && !/^\d/.test(w) && !POLARITY.has(w)))
  .map((w) => (w.startsWith('~') ? w : stem(w)));
/** Words in common over words in either, 0 to 1. Unlike `similarity`, a short claim inside a long one does not score 1. */
const jaccard = (a: string[], b: string[]): number => {
  const x = new Set(a);
  const y = new Set(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  x.forEach((w) => { if (y.has(w)) shared += 1; });
  return shared / (x.size + y.size - shared);
};
const subjectSimilarity = (a: string, b: string) => similarity(subjectWords(a).join(' '), subjectWords(b).join(' '));
/** Two claims have to be nearly word for word the same statement before a different number or a "not" counts as disagreement. */
const SAME_STATEMENT = 0.8;

/** The same statement with a different number or an opposite statement. Different years, or only loosely similar wording, are not conflicts. */
export function conflictReason(a: string, b: string): string | undefined {
  if (subjectSimilarity(a, b) < SAME_STATEMENT) return undefined;
  const ya = numbersIn(a).filter(isYear);
  const yb = numbersIn(b).filter(isYear);
  if (ya.length && yb.length && (ya.some((n) => !yb.includes(n)) || yb.some((n) => !ya.includes(n)))) return undefined;
  const na = numbersIn(a).filter((n) => !isYear(n));
  const nb = numbersIn(b).filter((n) => !isYear(n));
  const differs = na.length > 0 && nb.length > 0 && na.some((n) => !nb.includes(n)) && nb.some((n) => !na.includes(n));
  if (differs) return `States different numbers (${na.join(', ')} against ${nb.join(', ')})`;
  // The opposite of a claim is a conflict whatever its length. What keeps "not" in an unrelated long sentence from counting is the test that
  // the two share nearly every subject word both ways (a short claim inside a long one does not pass), not a cap on length.
  if (opposes(a, b) && jaccard(subjectWords(a), subjectWords(b)) >= 0.75) return 'Says the opposite of a known claim';
  return undefined;
}

/** Is this claim new, a repeat of a known one, or in conflict with one? The closest known claim decides. */
export function compareClaim(claim: string, known: Array<{ id: string; text: string }>): Comparison {
  let best: { id: string; score: number; text: string } | null = null;
  let conflict: { id: string; score: number; reason: string } | null = null;
  for (const k of known) {
    const score = similarity(claim, k.text);
    if (score < RELATED_AT) continue;
    if (!best || score > best.score) best = { id: k.id, score, text: k.text };
    // Every related claim is checked for disagreement BEFORE anything is merged: the claim it is nearly identical to may be a different
    // claim from the one it contradicts, and a repeat of one must not hide a contradiction of another.
    const reason = conflictReason(claim, k.text);
    if (reason && (!conflict || score > conflict.score)) conflict = { id: k.id, score, reason };
  }
  if (conflict) return { relation: 'contradicts', matchId: conflict.id, reason: conflict.reason };
  if (!best) return { relation: 'new' };
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

/**
 * A claim is a complete statement about the subject. A sentence that begins mid-way (", at least 61 full days) within that window .") or that
 * talks about other claims ("Claim A likely reflects...", "Statement B is also correct...", "Source Distinction: ...") is not one: it is
 * the report discussing its own material, and storing it only creates conflicts between pieces of discussion.
 */
const META = /\b(?:claims?|statements?|sources?)\s+[AB]\b|\b(?:both|either|neither)\s+(?:claims?|statements?)\b|^(?:source distinction|reasoning|note)\s*:/i;
export function isStandaloneClaim(sentence: string): boolean {
  const t = sentence.replace(/^\s*[-*\d.)]+\s*/, '').trim();
  if (!/^["'(]?[A-Z0-9]/.test(t)) return false;
  if (t.split(/\s+/).length < 5) return false;
  return !META.test(t);
}

/** Sentences of a report's answer, ready to be stored as separate claims, each keeping its [n] citation markers. No regex lookbehind: older Hermes builds lack it. */
export function claimSentences(text: string): string[] {
  const section = text.split(/^\s*(?:REASONING|UNSURE)\s*:/im)[0];
  const stripped = section.replace(/\bKEY POINTS\s*:/gi, '\nKEY POINTS:').replace(/^\s*(?:ANSWER|KEY POINTS)\s*:\s*/gim, '');
  const out: string[] = [];
  for (const line of stripped.split('\n')) {
    for (const sentence of line.match(/[^.!?]+(?:[.!?]+(?:\s*\[\d+\])*(?=\s|$)|$)/g) ?? []) {
      const clean = sentence.replace(/^\s*[-*\d.)]+\s*/, '').trim();
      if (clean.length >= 16 && clean.length <= 1200 && !/^(?:none|unknown|unsure)$/i.test(clean) && isStandaloneClaim(clean)) out.push(clean);
    }
  }
  return [...new Set(out)].slice(0, 12);
}

/** The known claims closest to a question, best first. Retrieval for practice and exams: no model involved. */
export function rankClaims<T extends { text: string }>(question: string, known: T[], limit = 5): T[] {
  return known
    .map((k) => ({ k, score: similarity(question, k.text) }))
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.k);
}

/**
 * How much of what the stored claims say an answer contains, 0 to 1. A claim counts as recalled when the answer has all of its
 * numbers and most of its words. Deterministic, so a model never grades its own memory.
 */
export function recallScore(answer: string, claims: string[]): number {
  if (!claims.length) return 0;
  const have = new Set(numbersIn(answer));
  // A claim recalled in its own words counts in full; one the answer only gets across in part (the right figures, about 40% of the words) counts half.
  // A wrong or missing figure is a wrong fact, so it earns nothing.
  const sentences = answer.match(/[^.!?\n]+[.!?]*/g) ?? [answer];
  const credit = claims.map((c): number => {
    const claim = c.replace(/\[\d+\]/g, '');
    if (!numbersIn(claim).every((n) => have.has(n))) return 0;
    const alike = similarity(claim, answer);
    const base = alike >= 0.5 ? 1 : alike >= 0.4 ? 0.5 : 0;
    if (!base) return 0;
    // Same words is not the same claim. Look at the sentence of the answer that talks about this claim: if it says the opposite ("not", "loss"
    // for "gain", "at most" for "at least") or the same figure in another unit, the learner has it wrong and earns nothing.
    const closest = sentences.reduce((top, s) => (similarity(claim, s) > similarity(claim, top) ? s : top), sentences[0]);
    if (opposes(claim, closest) || unitConflict(claim, closest)) return 0;
    // A rule with a condition or an exception that the answer states without one is only partly remembered.
    return CONDITION.test(claim) && !CONDITION.test(closest) ? Math.min(base, 0.5) : base;
  });
  return credit.reduce((a, b) => a + b, 0) / claims.length;
}
