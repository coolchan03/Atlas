import { lexicalRank, stem, terms } from '../../../../src/services/rag/lexicalRank';

const c = (position: number, content: string, doc_id = 1) => ({ doc_id, name: 'book.txt', content, position, score: 0 });

describe('lexicalRank', () => {
  it('matches word variants (plural, -ing, -ed)', () => {
    expect(stem('leases')).toBe(stem('lease'));
    expect(stem('lease')).toBe('leas');
    expect(stem('depreciating')).toBe(stem('depreciated'));
    const r = lexicalRank('how is equipment depreciated', [c(0, 'Table of contents'), c(1, 'Depreciation of equipment uses straight-line depreciating methods')], 3);
    expect(r.map((x) => x.position)).toEqual([1]);
  });

  it('returns nothing when no passage shares the question terms', () => {
    expect(lexicalRank('inventory valuation LIFO', [c(0, 'Photosynthesis in plants'), c(1, 'Roman history')], 5)).toEqual([]);
    expect(lexicalRank('the and for', [c(0, 'the and for')], 5)).toEqual([]);
    expect(lexicalRank('anything', [], 5)).toEqual([]);
  });

  it('prefers the passage matching more of the rarer terms', () => {
    const r = lexicalRank('lease liability discount rate', [c(0, 'company lease'), c(1, 'lease liability uses the discount rate'), c(2, 'company company lease')], 2);
    expect(r[0].position).toBe(1);
  });

  it('does not let a different subject win on one shared common word', () => {
    const r = lexicalRank('revenue recognition performance obligations', [c(0, 'revenue figures'), c(1, 'recognition of performance obligations in revenue contracts')], 5);
    expect(r.map((x) => x.position)).toEqual([1]);
  });

  it('keeps numbers and section references as terms', () => {
    expect(terms('ASC 842 lease')).toEqual(expect.arrayContaining(['842']));
  });
});
