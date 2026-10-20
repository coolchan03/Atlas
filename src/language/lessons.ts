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
  | { kind: 'build'; item: Item; tiles: string[]; answer: string };

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

/** About ten exercises covering every item at least once, with one matching round. */
export function buildLesson(items: Item[], seed = Date.now(), length = 10): Exercise[] {
  const r = rng(seed);
  const all = shuffle(items, r);
  const out: Exercise[] = [];
  const kinds: ('choose' | 'meaning' | 'listen' | 'build')[] = ['choose', 'meaning', 'listen', 'build'];
  for (let i = 0; out.length < length - 1 && i < length * 2; i++) {
    const item = all[i % all.length];
    let kind = kinds[i % kinds.length];
    if (kind === 'build' && words(item.t).length < 3) kind = 'choose';
    if (kind === 'build') out.push({ kind, item, tiles: shuffle(words(item.t), r), answer: item.t });
    else if (kind === 'meaning') out.push({ kind, item, options: options(item.en, items.map((x) => x.en), r), answer: item.en });
    else out.push({ kind, item, options: options(item.t, items.map((x) => x.t), r), answer: item.t });
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
