import { asuNumbers, hostOf, isOfficialUrl, overrules } from '../../../src/standards/authority';
import { officialPages, standardsCheck } from '../../../src/standards/lookup';
import { standardsNote } from '../../../src/topics/formats';

describe('which sources have the last word', () => {
  it('recognises a standard-setter by its host, and not a look-alike', () => {
    expect(hostOf('https://www.fasb.org/standards/x')).toBe('fasb.org');
    expect(isOfficialUrl('https://asc.fasb.org/topic/842')).toBe(true);
    expect(isOfficialUrl('https://www.irs.gov/pub/irs-pdf/p17.pdf')).toBe(true);
    expect(isOfficialUrl('https://fasb.org.evil.com/page')).toBe(false);
    expect(isOfficialUrl('https://notfasb.org/page')).toBe(false);
    expect(isOfficialUrl('not a url')).toBe(false);
  });

  it('finds ASU numbers, newest first', () => {
    expect(asuNumbers('ASU 2016-13 and ASU No. 2023-07, also asu 2016-13 again')).toEqual(['2023-07', '2016-13']);
    expect(asuNumbers('nothing here')).toEqual([]);
  });

  it('lets an official source overrule textbook-only claims, unless the textbook is newer', () => {
    const book = { kind: 'project', title: 'FAR textbook.pdf' };
    const fasb = { kind: 'web', url: 'https://asc.fasb.org/topic/326', title: 'ASC 326' };
    expect(overrules([fasb], [book])).toBe(true);
    expect(overrules([book], [fasb])).toBe(false);
    expect(overrules([fasb], [fasb])).toBe(false);
    expect(overrules([{ kind: 'web', url: 'https://example.com/blog' }], [book])).toBe(false);
    expect(overrules([{ ...fasb, publicationDate: '2023-06-01' }], [{ ...book, publicationDate: '2025-01-01' }])).toBe(false); // a newer book does not lose to an older rule
    expect(overrules([{ ...fasb, publicationDate: '2025-06-01' }], [{ ...book, publicationDate: '2022-01-01' }])).toBe(true);
  });
});

describe('looking up the latest standards', () => {
  const hit = (title: string, url: string, snippet = '') => ({ title, url, snippet });

  it('keeps only the standard-setters\' own pages and puts the newest update first', async () => {
    const search = jest.fn(async () => [
      hit('Blog about leases', 'https://example.com/leases'),
      hit('ASU 2016-02 Leases', 'https://www.fasb.org/asu-2016-02'),
      hit('ASU 2023-01 Common control leases', 'https://www.fasb.org/asu-2023-01'),
      hit('Fake', 'https://fasb.org.evil.com/asu-2030-01'),
    ]);
    const pages = await officialPages('ASC 842 leases', search);
    expect(pages.map((p) => p.url)).toEqual(['https://www.fasb.org/asu-2023-01', 'https://www.fasb.org/asu-2016-02']);
    expect(search.mock.calls[0][0]).toContain('site:fasb.org');
  });

  it('says it was not checked when nothing official was found, and fails loudly when the search could not run', async () => {
    const none = await standardsCheck('obscure topic', async () => [{ title: 'Blog', url: 'https://example.com' }]);
    expect(none).toContain('could not be checked against the latest standard');
    expect(none).toContain('not checked');
    await expect(standardsCheck('x', async () => { throw new Error('offline'); })).rejects.toThrow('offline or blocked');
    await expect(standardsCheck('  ', async () => [])).rejects.toThrow('topic');
  });

  it('tells the model to quote, cite the ASU and never invent one', async () => {
    const out = await standardsCheck('credit losses', async () => [{ title: 'ASU 2016-13 Credit Losses', url: 'https://www.fasb.org/asu-2016-13', snippet: 'CECL model' }]);
    expect(out).toContain('(ASU 2016-13)');
    expect(out).toContain('The standard overrules a textbook that predates it');
    expect(out).toContain('Never give an ASU number or date that is not on one of these pages');
  });
});

describe('lessons on accounting', () => {
  it('ask for a "Check:" line instead of stating an update from memory, and only for accounting', () => {
    expect(standardsNote('CPA FAR: Leases')).toContain('Never state an ASU number');
    expect(standardsNote('Biology: Cells')).toBe('');
  });
});
