import { outlineFromText, outlineToText } from '../../../src/cpa/outline';

it('reads a well-shaped outline in code without asking the AI', async () => {
  const ask = jest.fn();
  const text = 'Area I: Taxes:\nBasis\nGains\nLeases\nArea II: Entities:\nS corporations\nPartnerships\nTrusts';
  const areas = await outlineFromText(text, ask);
  expect(areas).toHaveLength(2);
  expect(ask).not.toHaveBeenCalled();
});

it('has the AI sort loose text into areas and topics, and writes them back as text to check', async () => {
  const ask = jest.fn().mockResolvedValue(JSON.stringify({ areas: [{ area: 'Ethics', topics: ['Circular 230', 'Penalties'] }, { area: 'Business law', topics: ['Contracts'] }, { area: '', topics: ['x'] }] }));
  const areas = await outlineFromText('The exam covers ethics, circular 230, penalties, contracts and more run together in one paragraph.', ask);
  expect(areas).toEqual([{ area: 'Ethics', topics: ['Circular 230', 'Penalties'] }, { area: 'Business law', topics: ['Contracts'] }]);
  expect(outlineToText(areas)).toBe('Ethics:\nCircular 230\nPenalties\nBusiness law:\nContracts');
});
