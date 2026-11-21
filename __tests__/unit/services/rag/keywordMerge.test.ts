import { mergeKeywordHits } from '../../../../src/services/rag/keywordMerge';
import { ftsMatchQuery } from '../../../../src/services/rag/ftsQuery';

const c = (doc_id: number, position: number, score: number) => ({ doc_id, name: `d${doc_id}`, content: `c${doc_id}.${position}`, position, score });

describe('mergeKeywordHits', () => {
  it('adds passages only the words found, below the best meaning-based one and above the floor', () => {
    const merged = mergeKeywordHits([c(1, 0, 0.8), c(1, 1, 0.6)], [c(2, 0, 9), c(2, 1, 8)], 5);
    expect(merged.map((m) => `${m.doc_id}.${m.position}`)).toEqual(['1.0', '1.1', '2.0', '2.1']); // 0.8, 0.6, then the keyword-only ones at 0.56 and 0.55
    const added = merged.find((m) => m.doc_id === 2 && m.position === 0)!;
    expect(added.score).toBeLessThan(0.8);
    expect(added.score).toBeGreaterThan(0.8 * 0.5); // rankChunks drops anything under half of the best
  });

  it('does not repeat a passage both lists have, and leaves the list alone when there is nothing to add or nothing to compare with', () => {
    const semantic = [c(1, 0, 0.8)];
    expect(mergeKeywordHits(semantic, [c(1, 0, 3)], 5)).toEqual(semantic);
    expect(mergeKeywordHits(semantic, [], 5)).toBe(semantic);
    expect(mergeKeywordHits([c(1, 0, 0)], [c(2, 0, 3)], 5).map((m) => m.doc_id)).toEqual([1]); // no usable score: nothing to scale against
  });

  it('adds no more keyword hits than the limit', () => {
    const merged = mergeKeywordHits([c(1, 0, 1)], [c(2, 0, 3), c(2, 1, 2), c(2, 2, 1)], 2);
    expect(merged).toHaveLength(3);
  });
});

describe('ftsMatchQuery', () => {
  it('quotes each stemmed word as a prefix, so no word can act as an operator', () => {
    expect(ftsMatchQuery('How are leases measured?')).toBe('"leas"* OR "measur"*');
    expect(ftsMatchQuery('AND NOT "x" NEAR')).not.toMatch(/\b(?:AND|NOT|NEAR)\b(?!")/);
    expect(ftsMatchQuery('the of a')).toBe('');
  });
});
