export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface SimilarityResult {
  index: number;
  score: number;
}

export function topKSimilar(queryVec: number[], candidates: number[][], k: number): SimilarityResult[] {
  const scored = candidates.map((vec, index) => ({
    index,
    score: cosineSimilarity(queryVec, vec),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

const lengths = new WeakMap<object, number>();
const lengthOf = (v: ArrayLike<number>): number => {
  let n = lengths.get(v);
  if (n === undefined) {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    n = Math.sqrt(sum);
    lengths.set(v, n);
  }
  return n;
};

/**
 * Cosine similarity of many stored vectors against one question vector. The question's length is worked out once, and each stored vector's once
 * for as long as the vector is kept (a project's vectors are searched many times in a row), so a search does one pass over each vector, not
 * two. Gives the same numbers as cosineSimilarity.
 */
export function cosineScorer(query: ArrayLike<number>): (vec: ArrayLike<number>) => number {
  const qLen = lengthOf(query);
  return (vec) => {
    const denom = qLen * lengthOf(vec);
    if (denom === 0) return 0;
    let dot = 0;
    const n = Math.min(query.length, vec.length);
    for (let i = 0; i < n; i++) dot += query[i] * vec[i];
    return dot / denom;
  };
}

/**
 * The `k` items with the highest scores, best first, without scoring-and-sorting the whole list into new objects: one pass keeps a small sorted
 * shortlist, and only an item that beats the shortlist's worst is placed in it. For a library of tens of thousands of passages that is one score per
 * passage and a few insertions, instead of a list of that many objects sorted. Items with a NaN score are never chosen. Ties keep list order.
 */
export function topByScore<T>(items: readonly T[], scoreOf: (item: T) => number, k: number): Array<{ item: T; score: number }> {
  const best: Array<{ item: T; score: number }> = [];
  if (k <= 0) return best;
  for (const item of items) {
    const score = scoreOf(item);
    if (Number.isNaN(score)) continue;
    if (best.length === k && score <= best[k - 1].score) continue;
    let at = best.length;
    while (at > 0 && best[at - 1].score < score) at -= 1;
    best.splice(at, 0, { item, score });
    if (best.length > k) best.pop();
  }
  return best;
}
