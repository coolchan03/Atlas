import { cosineScorer, cosineSimilarity, dotProduct, topKSimilar } from '../../../../src/services/rag/vectorMath';

describe('vectorMath', () => {
  describe('dotProduct', () => {
    it('computes dot product of two vectors', () => {
      expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(dotProduct([1, 0], [0, 1])).toBe(0);
    });

    it('returns 0 for zero vectors', () => {
      expect(dotProduct([0, 0, 0], [1, 2, 3])).toBe(0);
    });

    it('handles negative values', () => {
      expect(dotProduct([-1, 2], [3, -4])).toBe(-11);
    });

    it('handles single-element vectors', () => {
      expect(dotProduct([5], [3])).toBe(15);
    });

    it('handles large vectors efficiently', () => {
      const a = new Array(384).fill(1);
      const b = new Array(384).fill(2);
      expect(dotProduct(a, b)).toBe(768);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = [1, 2, 3];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1);
    });

    it('returns -1 for opposite vectors', () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it('returns 0 when either vector is zero', () => {
      expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
      expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
    });

    it('returns 0 when both vectors are zero', () => {
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });

    it('is independent of magnitude', () => {
      const sim1 = cosineSimilarity([1, 2, 3], [4, 5, 6]);
      const sim2 = cosineSimilarity([10, 20, 30], [40, 50, 60]);
      expect(sim1).toBeCloseTo(sim2);
    });

    it('returns 1 for scaled versions of same vector', () => {
      expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    });

    it('handles high-dimensional vectors (384d)', () => {
      const a = new Array(384).fill(0).map((_, i) => Math.sin(i));
      const b = new Array(384).fill(0).map((_, i) => Math.cos(i));
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it('returns value between -1 and 1 for random vectors', () => {
      const a = [0.5, -0.3, 0.8, -0.1];
      const b = [-0.2, 0.7, 0.1, 0.9];
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    });
  });

  describe('topKSimilar', () => {
    it('returns top K most similar candidates', () => {
      const query = [1, 0, 0];
      const candidates = [
        [0, 1, 0],  // orthogonal
        [1, 0, 0],  // identical
        [0.5, 0.5, 0],  // partially similar
      ];

      const results = topKSimilar(query, candidates, 2);
      expect(results).toHaveLength(2);
      expect(results[0].index).toBe(1);  // identical vector first
      expect(results[0].score).toBeCloseTo(1);
      expect(results[1].index).toBe(2);  // partially similar second
    });

    it('returns all candidates if k > length', () => {
      const results = topKSimilar([1, 0], [[0, 1], [1, 0]], 5);
      expect(results).toHaveLength(2);
    });

    it('returns empty for empty candidates', () => {
      expect(topKSimilar([1, 0], [], 3)).toEqual([]);
    });

    it('sorts by descending score', () => {
      const query = [1, 1];
      const candidates = [[0, 1], [1, 1], [1, 0]];
      const results = topKSimilar(query, candidates, 3);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });

    it('returns exactly k results when k < candidates', () => {
      const candidates = [[1, 0], [0, 1], [1, 1], [0, 0]];
      const results = topKSimilar([1, 0], candidates, 2);
      expect(results).toHaveLength(2);
    });

    it('handles k = 1', () => {
      const results = topKSimilar([1, 0], [[0, 1], [1, 0], [0.5, 0.5]], 1);
      expect(results).toHaveLength(1);
      expect(results[0].index).toBe(1); // exact match
    });

    it('each result has index and score', () => {
      const results = topKSimilar([1, 0], [[0, 1], [1, 0]], 2);
      results.forEach(r => {
        expect(r).toHaveProperty('index');
        expect(r).toHaveProperty('score');
        expect(typeof r.index).toBe('number');
        expect(typeof r.score).toBe('number');
      });
    });

    it('preserves original candidate indices', () => {
      // The best match is at index 2, not index 0
      const query = [0, 0, 1];
      const candidates = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const results = topKSimilar(query, candidates, 1);
      expect(results[0].index).toBe(2);
    });
  });
});

describe('cosineScorer', () => {
  it('gives the same numbers as cosineSimilarity, for plain arrays and 32-bit floats alike', () => {
    const q = [0.2, -0.5, 0.9, 0.1];
    const vectors = [[1, 0, 0, 0], [0.2, -0.5, 0.9, 0.1], [-1, 1, -1, 1], [0, 0, 0, 0]];
    const score = cosineScorer(q);
    for (const v of vectors) {
      expect(score(v)).toBeCloseTo(cosineSimilarity(q, v), 10);
      expect(score(Float32Array.from(v))).toBeCloseTo(cosineSimilarity(q, v), 5);
    }
  });

  it('scores a zero vector, or a zero question, as 0 rather than NaN', () => {
    expect(cosineScorer([1, 2])([0, 0])).toBe(0);
    expect(cosineScorer([0, 0])([1, 2])).toBe(0);
  });
});

describe('topByScore', () => {
  const { topByScore } = require('../../../../src/services/rag/vectorMath');
  const scores = (items: number[], k: number) => topByScore(items, (x: number) => x, k).map((r: { score: number }) => r.score);

  it('returns the k best, best first, the same as sorting everything', () => {
    const items = Array.from({ length: 500 }, (_, i) => ((i * 7919) % 1000) / 10);
    const sorted = [...items].sort((a, b) => b - a);
    for (const k of [1, 5, 30, 500, 900]) expect(scores(items, k)).toEqual(sorted.slice(0, k));
  });

  it('keeps list order for equal scores, skips NaN, and gives nothing for k of 0', () => {
    const r = topByScore([{ n: 'a', s: 1 }, { n: 'b', s: 1 }, { n: 'c', s: NaN }, { n: 'd', s: 2 }], (x: { s: number }) => x.s, 3);
    expect(r.map((x: { item: { n: string } }) => x.item.n)).toEqual(['d', 'a', 'b']);
    expect(scores([1, 2, 3], 0)).toEqual([]);
  });
});
