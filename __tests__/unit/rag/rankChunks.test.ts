import { rankChunks, Scored } from '../../../src/services/rag/rankChunks';

const chunk = (doc: number, score: number, content = 'text', position = 0): Scored => ({ doc_id: doc, name: `d${doc}`, content, position, score });

describe('ranking retrieved chunks', () => {
  it('always keeps the best chunk, even when every score is low, and handles no candidates and no usable scores', () => {
    expect(rankChunks('boil water', [chunk(1, 0.05), chunk(2, 0.03)], 5).map((c) => c.doc_id)).toEqual([1, 2]);
    expect(rankChunks('boil water', [], 5)).toEqual([]);
    expect(rankChunks('boil water', [chunk(1, 0), chunk(2, 0)], 1).map((c) => c.doc_id)).toEqual([1]);
  });

  it('drops chunks far below the best one but keeps the close ones', () => {
    const out = rankChunks('boil water', [chunk(1, 0.8), chunk(2, 0.7), chunk(3, 0.2)], 5);
    expect(out.map((c) => c.doc_id)).toEqual([1, 2]);
  });

  it('spreads picks across documents: a second chunk from the same document must be clearly better to win', () => {
    const out = rankChunks('q', [chunk(1, 0.8, 'a', 0), chunk(1, 0.75, 'b', 1), chunk(2, 0.7, 'c', 0)], 2);
    expect(out.map((c) => c.doc_id)).toEqual([1, 2]);
    const clear = rankChunks('q', [chunk(1, 0.9, 'a', 0), chunk(1, 0.88, 'b', 1), chunk(2, 0.6, 'c', 0)], 2);
    expect(clear.map((c) => `${c.doc_id}:${c.position}`)).toEqual(['1:0', '1:1']);
  });

  it('lifts a chunk that uses the question\'s words, but only if it already looked relevant', () => {
    const out = rankChunks('standard deduction single filer', [chunk(1, 0.5, 'general tax rules'), chunk(2, 0.48, 'The standard deduction for a single filer is shown')], 2);
    expect(out[0].doc_id).toBe(2);
    const weak = rankChunks('standard deduction single filer', [chunk(1, 0.9, 'unrelated'), chunk(2, 0.45, 'standard deduction single filer')], 2);
    expect(weak[0].doc_id).toBe(1); // below the gate: shared words alone cannot win
  });

  it('returns at most topK', () => {
    const many = Array.from({ length: 12 }, (_, i) => chunk(i, 0.9 - i * 0.01));
    expect(rankChunks('q', many, 3)).toHaveLength(3);
  });
});
