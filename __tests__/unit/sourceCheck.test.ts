const mockSearch = jest.fn();
const mockLibrary = jest.fn();
jest.mock('../../src/services/rag/retrieval', () => ({ retrievalService: { search: (...a: unknown[]) => mockSearch(...a) } }));
jest.mock('../../src/atlasTools/offlineLibrary', () => ({ libraryToolAnswer: (...a: unknown[]) => mockLibrary(...a) }));

import { checkAgainstSources, claimsOf, judgeClaim, sourceCheckNote } from '../../src/services/sourceCheck';

const POLICY = 'A refund for a damaged parcel is paid within five working days after the parcel is returned. Parcels are sent every Tuesday and Friday. The warranty lasts 24 months.';

describe('claims and judging', () => {
  it('takes the sentences that state something checkable, not greetings or questions, at most six', () => {
    const reply = 'Sure! Here is what I found.\n\nThe warranty lasts 24 months from the date of purchase. Is that what you wanted? **Parcels** are sent every Tuesday and Friday from the warehouse. I hope this helps.';
    expect(claimsOf(reply)).toEqual(['The warranty lasts 24 months from the date of purchase.', 'Parcels are sent every Tuesday and Friday from the warehouse.']);
    expect(claimsOf(Array.from({ length: 12 }, (_, i) => `The part number ${i + 10} is a standard component of the unit.`).join(' '))).toHaveLength(6);
  });

  it('says supported when the words and figures are in the passage, conflict when the passage gives other figures, unverified when it does not speak of it', () => {
    expect(judgeClaim('The warranty lasts 24 months from purchase.', POLICY)).toBe('supported');
    expect(judgeClaim('The warranty lasts 36 months from purchase.', POLICY)).toBe('conflict');
    expect(judgeClaim('Parcels are sent every Tuesday and Friday.', POLICY)).toBe('supported');
    expect(judgeClaim('Customers receive a free replacement within a fortnight.', POLICY)).toBe('unverified');
    expect(judgeClaim('It is.', POLICY)).toBe('unverified');
  });
});

describe('checkAgainstSources', () => {
  it('looks each claim up in the project documents and reports what they say', async () => {
    mockSearch.mockResolvedValue({ chunks: [{ name: 'policy.pdf', content: POLICY, doc_id: 1, position: 0, score: 1 }], truncated: false });
    const checks = await checkAgainstSources('The warranty lasts 24 months from the date of purchase. The warranty lasts 36 months for business customers. Customers also receive a free replacement within 14 days.', 'proj1');
    expect(checks.map((c) => c.verdict)).toEqual(['supported', 'conflict', 'unverified']);
    expect(mockSearch).toHaveBeenCalledWith('proj1', expect.stringMatching(/warranty lasts 24 months/), 3);
    const note = sourceCheckNote(checks);
    expect(note).toMatch(/Supported \(1\):\n- The warranty lasts 24 months from the date of purchase\. \(policy\.pdf\)/);
    expect(note).toMatch(/Conflicts with a source \(1\):[\s\S]*policy\.pdf says: A refund for a damaged parcel/);
    expect(note).toMatch(/Not found in your sources \(1\):/);
    expect(note).toMatch(/Not found does not mean wrong/);
  });

  it('uses the offline library when there is no project, and says plainly when there is nothing to look in or nothing to check', async () => {
    mockLibrary.mockResolvedValueOnce(`[Wikipedia: Water]\n${'Water boils at 100 degrees Celsius at sea level. '.repeat(3)}`);
    const checks = await checkAgainstSources('Water boils at 100 degrees Celsius at sea level.', undefined);
    expect(checks[0]).toMatchObject({ verdict: 'supported', source: 'the offline library' });
    mockLibrary.mockResolvedValue('No offline library files are added. (Settings > Offline library)');
    await expect(checkAgainstSources('Water boils at 100 degrees Celsius at sea level.', undefined)).rejects.toThrow(/nothing to check against/);
    await expect(checkAgainstSources('Sure, happy to help!', 'proj1')).rejects.toThrow(/no statements of fact/);
  });
});
