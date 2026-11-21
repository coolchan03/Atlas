import { groupsOf, parseFinish, parseOutline, passagesFor } from '../../../src/topics/lessonParts';

describe('a lesson written in pieces', () => {
  it('reads an outline, and needs at least two headings', () => {
    expect(parseOutline('Sure: {"sections":[{"heading":"Cash","focus":"what counts"},{"heading":"Debts","focus":"what is owed"}]}')).toEqual([{ heading: 'Cash', focus: 'what counts' }, { heading: 'Debts', focus: 'what is owed' }]);
    expect(parseOutline('{"sections":[{"heading":"Only one"}]}')).toBeNull();
    expect(parseOutline('no json')).toBeNull();
  });

  it('writes sections two at a time, each with the passages that fit them', () => {
    expect(groupsOf([1, 2, 3, 4, 5])).toEqual([[1, 2], [3, 4], [5]]);
    const excerpts = [{ text: 'Bonds pay interest every year.' }, { text: 'Leases give the right to use an asset for a time.' }, { text: 'Equity is what is left for the owners.' }, { text: 'Lease payments are discounted.' }];
    const chosen = passagesFor(excerpts, [{ heading: 'Leases', focus: 'lease payments and the right to use an asset' }], 2);
    expect(chosen.map((e) => e.text)).toEqual(['Leases give the right to use an asset for a time.', 'Lease payments are discounted.']);
    expect(passagesFor(undefined, [], 3)).toEqual([]);
  });

  it('reads the mistakes, the check question and the key points', () => {
    expect(parseFinish('{"commonMistakes":["Mixing up cash and profit"],"quickCheck":{"q":"What is cash?","a":"Money in hand"},"keyPoints":["Cash is king"]}')).toEqual({ keyPoints: ['Cash is king'], commonMistakes: ['Mixing up cash and profit'], quickCheck: { q: 'What is cash?', a: 'Money in hand' } });
    expect(parseFinish('{}')).toBeNull();
  });
});
