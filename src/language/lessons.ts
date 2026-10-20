/**
 * Building a lesson from a unit's words, Duolingo-style: pick the translation, pick the meaning,
 * listen and pick, match pairs and put words in order. Pure, so it is tested without a device.
 */
export interface Item { en: string; t: string; r?: string }

export type Exercise =
  | { kind: 'choose'; item: Item; options: string[]; answer: string }
  | { kind: 'meaning'; item: Item; options: string[]; answer: string }
  | { kind: 'listen'; item: Item; options: string[]; answer: string }
  | { kind: 'match'; pairs: Item[] }
  | { kind: 'build'; item: Item; tiles: string[]; answer: string }
  /** Hear a phrase, then tap its words in order (Duolingo's "tap what you hear"). */
  | { kind: 'hear'; item: Item; tiles: string[]; answer: string }
  /** A phrase with one word missing: pick the word that goes in the gap. */
  | { kind: 'blank'; item: Item; shown: string; options: string[]; answer: string };

/** Small seeded random so a lesson can be rebuilt the same way in tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const shuffle = <T,>(a: T[], r: () => number): T[] => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
const options = (right: string, pool: string[], r: () => number) =>
  shuffle([right, ...shuffle(pool.filter((p) => p !== right), r).slice(0, 3)], r);

/** Words of a phrase for the word-order exercise (punctuation kept on its word). */
export const words = (t: string) => t.split(/\s+/).filter(Boolean);

/** The phrase with one word replaced by a gap, and the missing word. */
export function blankOut(t: string, r: () => number): { shown: string; answer: string } | null {
  const w = words(t);
  const candidates = w.map((x, i) => ({ x, i })).filter(({ x }) => x.replace(/[.!?¡¿,]/g, '').length > 1);
  if (w.length < 3 || !candidates.length) return null;
  const pick = candidates[Math.floor(r() * candidates.length)];
  const answer = pick.x.replace(/[.!?¡¿,]/g, '');
  return { shown: w.map((x, i) => (i === pick.i ? x.replace(answer, '____') : x)).join(' '), answer };
}

type Kind = 'choose' | 'meaning' | 'listen' | 'build' | 'hear' | 'blank';
const KINDS: Kind[] = ['choose', 'meaning', 'blank', 'listen', 'build', 'hear'];
/** Phrase-only kinds fall back to a word exercise for single words. */
const FALLBACK: Partial<Record<Kind, Kind>> = { build: 'choose', hear: 'listen', blank: 'meaning' };

function exerciseFor(kind: Kind, item: Item, ctx: { items: Item[]; r: () => number }): Exercise {
  const { items, r } = ctx;
  const long = words(item.t).length >= 3;
  const k = !long && FALLBACK[kind] ? FALLBACK[kind]! : kind;
  if (k === 'build' || k === 'hear') return { kind: k, item, tiles: shuffle(words(item.t), r), answer: item.t };
  if (k === 'blank') {
    const b = blankOut(item.t, r);
    if (b) {
      const pool = items.flatMap((x) => words(x.t)).map((x) => x.replace(/[.!?¡¿,]/g, '')).filter((x) => x.length > 1);
      return { kind: 'blank', item, shown: b.shown, options: options(b.answer, [...new Set(pool)], r), answer: b.answer };
    }
    return exerciseFor('meaning', item, ctx);
  }
  if (k === 'meaning') return { kind: k, item, options: options(item.en, items.map((x) => x.en), r), answer: item.en };
  return { kind: k as 'choose' | 'listen', item, options: options(item.t, items.map((x) => x.t), r), answer: item.t };
}

/** About ten exercises covering every item at least once, with one matching round. */
export function buildLesson(items: Item[], seed = Date.now(), length = 10): Exercise[] {
  const r = rng(seed);
  const all = shuffle(items, r);
  const out: Exercise[] = [];
  for (let i = 0; out.length < length - 1 && i < length * 2; i++) {
    out.push(exerciseFor(KINDS[i % KINDS.length], all[i % all.length], { items, r }));
  }
  out.splice(Math.min(4, out.length), 0, { kind: 'match', pairs: all.slice(0, Math.min(5, all.length)) });
  return out;
}

/** Answers are compared without case, accents' spacing or end punctuation. */
export const sameAnswer = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/[.!?¡¿,]/g, '').replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
};

/** 3 stars at 90% right, 2 at 70%, otherwise 1 for finishing. */
export const starsFor = (right: number, total: number) => (right / Math.max(1, total) >= 0.9 ? 3 : right / Math.max(1, total) >= 0.7 ? 2 : 1);
