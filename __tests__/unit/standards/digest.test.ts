import { digestTopics, newestBookYear, updatesSince, yearOfPage } from '../../../src/standards/digest';

describe('what changed since the books', () => {
  it('reads the year a page is about, and the newest year in the names of the books', () => {
    expect(yearOfPage('ASU 2023-01 Leases (Topic 842)')).toBe(2023);
    expect(yearOfPage('Nothing dated')).toBe(0);
    expect(newestBookYear(['Intermediate Accounting 2021.pdf', 'Advanced Accounting (2022).pdf', 'Notes.pdf'])).toBe(2022);
    expect(newestBookYear(['Notes.pdf'])).toBeNull();
  });
  it('ignores years in the future (effective dates) and numbers that are not years, and trusts a title over a snippet', async () => {
    expect(yearOfPage('effective for fiscal years beginning after December 15, 2999', 2025)).toBe(0);
    expect(newestBookYear(['scan_2048.pdf', 'Intermediate Accounting 2022.pdf'])).toBe(2022);
    const search = async () => [{ title: 'ASU 2016-02 Leases (Topic 842)', url: 'https://www.fasb.org/asu-2016-02', snippet: 'effective for fiscal years beginning after December 15, 2026' }];
    expect((await updatesSince({ topics: ['leases'], bookYear: 2022, search })).items).toEqual([]); // a 2016 update with a future effective date is not new
  });
  it('picks the topics that change: FASB ones for accounting exams, IRS notices for tax, the first few for the rest', () => {
    expect(digestTopics('FAR', ['Leases', 'Revenue recognition', 'Cash and receivables', 'Income taxes'])).toEqual(['Accounting Standards Update', 'leases', 'revenue', 'income taxes']);
    expect(digestTopics('REG', ['Basis'])).toContain('IRS Notice');
    expect(digestTopics('BAR', ['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('lists only official pages newer than the newest book, newest first, with links, and not older ones', async () => {
    const search = async (q: string) => (/leases/i.test(q) ? [
      { title: 'ASU 2023-01: Leases (Topic 842): Common Control Arrangements', url: 'https://www.fasb.org/asu-2023-01', snippet: 'Issued March 2023.' },
      { title: 'ASU 2016-02 Leases', url: 'https://www.fasb.org/asu-2016-02', snippet: 'Issued 2016.' },
      { title: 'A blog about leases 2024', url: 'https://example.com/blog', snippet: 'not official' },
    ] : []);
    const d = await updatesSince({ topics: ['leases'], bookYear: 2022, search });
    expect(d.items.map((i) => i.url)).toEqual(['https://www.fasb.org/asu-2023-01']);
    expect(d.items[0]).toMatchObject({ year: 2023, topic: 'leases' });
    expect(d.offline).toBe(false);
  });
  it('says offline when no search could be made, not "nothing changed"', async () => {
    const d = await updatesSince({ topics: ['leases', 'revenue'], bookYear: 2022, search: async () => { throw new Error('offline'); } });
    expect(d).toMatchObject({ offline: true, failed: 2, items: [] });
  });
});
