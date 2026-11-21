/**
 * The Wikipedia fun-fact workflow: pages are judged by what they say, several interests are tried before giving up,
 * and when nothing comes back the reason is the real one.
 */
const mockOffGrid = { on: false };
jest.mock('../../src/atlasTools/offGrid', () => ({ offGridOn: () => mockOffGrid.on }));
const mockLibrary = { hits: [] as any[] };
jest.mock('../../src/atlasTools/offlineLibrary', () => ({
  searchLibrary: jest.fn(async () => mockLibrary.hits),
  readArticle: jest.fn(async () => ({ title: 'Octopus', text: 'An octopus has three hearts and blue blood, which is unusual among animals of its size.' })),
}));

import { unsuitableExtract, funFactAttempt, noFunFactMessage, previewFunFact } from '../../src/atlasTools/dailyBrief';

const ARTICLE = 'The octopus has three hearts: two pump blood through the gills and one through the rest of the body. Its blood is blue because it carries copper.';

function wiki(pages: Record<string, { type?: string; extract: string; title?: string }>, search: string[]) {
  (global as any).fetch = jest.fn(async (url: string) => {
    if (/list=search/.test(url)) return { ok: true, text: async () => JSON.stringify({ query: { search: search.map((title) => ({ title })) } }) };
    const title = decodeURIComponent(url.split('/summary/')[1]);
    const page = pages[title];
    if (!page) return { ok: false, status: 404, text: async () => 'not found' };
    return { ok: true, text: async () => JSON.stringify({ title, ...page }) };
  });
}

beforeEach(() => { mockOffGrid.on = false; mockLibrary.hits = []; jest.restoreAllMocks(); });

describe('unsuitableExtract: judged by what the page says', () => {
  it.each([
    ['Mercury', 'Mercury may refer to: the planet, the element, the Roman god, or a record label, among other things.', /lists several meanings/],
    ['Mercury', 'Mercury can also refer to a number of other things that are described on this page in detail.', /lists several meanings/],
    ['Octopus', 'Octopus redirects here. For other uses see the disambiguation page for the word.', /redirect or stub/],
    ['Some Place', 'This article is a stub. You can help by expanding it with more details and sources, please.', /redirect or stub/],
    ['Category:Animals', 'A category of pages about animals found across the encyclopedia and its sister projects here.', /not an article/],
    ['Tiny', 'Short.', /too short/],
    ['Table', '1999 2000 2001 2002 2003 2004 2005 2006 2007 2008 2009 2010 2011 2012 2013 2014 2015 2016 2017', /numbers or symbols|no complete sentence/],
    ['NoStop', 'This text has plenty of letters and words but never ends with any kind of sentence punctuation at all', /no complete sentence/],
  ])('rejects %s', (title, text, why) => { expect(unsuitableExtract(title as string, text as string)).toMatch(why as RegExp); });

  it('accepts a real article', () => { expect(unsuitableExtract('Octopus', ARTICLE)).toBe(''); });
});

describe('funFactAttempt', () => {
  it('finds a fact on a suitable page and passes over an unsuitable one without telling it', async () => {
    wiki({ Mercury: { extract: 'Mercury may refer to: the planet, the element, the Roman god, or a record label, among others.' }, Octopus: { extract: ARTICLE } }, ['Mercury', 'Octopus']);
    jest.spyOn(Math, 'random').mockReturnValue(0); // tries Mercury first
    const r = await funFactAttempt(['sea life']);
    expect(r.kind).toBe('found');
    if (r.kind === 'found') { expect(r.fact.page).toBe('Wikipedia: Octopus'); expect(r.fact.text).toContain('three hearts'); }
  });

  it('tries a second interest when the first has nothing, instead of giving up', async () => {
    wiki({ Octopus: { extract: ARTICLE } }, []);
    (global as any).fetch = jest.fn(async (url: string) => {
      if (/list=search/.test(url)) return { ok: true, text: async () => JSON.stringify({ query: { search: /srsearch=sea/.test(url) ? [{ title: 'Octopus' }] : [] } }) };
      return /summary\/Octopus$/.test(url) ? { ok: true, text: async () => JSON.stringify({ title: 'Octopus', extract: ARTICLE }) } : { ok: false, status: 404, text: async () => 'not found' };
    });
    jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.9); // interests are tried in this order: nothing-here, then sea
    const r = await funFactAttempt(['nothing-here', 'sea']);
    expect(r.kind).toBe('found');
    expect((global as any).fetch.mock.calls.filter((c: string[]) => /list=search/.test(c[0])).length).toBeGreaterThanOrEqual(2);
  });

  it('uses the offline library first', async () => {
    mockLibrary.hits = [{ uri: 'u', path: 'p', library: 'Wikipedia (offline)' }];
    (global as any).fetch = jest.fn();
    const r = await funFactAttempt(['sea life']);
    expect(r.kind).toBe('found');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('says why when there is nothing: no interests', async () => {
    expect(await funFactAttempt([])).toMatchObject({ kind: 'none', why: 'no-interests' });
    expect(await funFactAttempt(['  ', ''])).toMatchObject({ kind: 'none', why: 'no-interests' });
  });

  it('says why when there is nothing: off-grid mode (and never touches the network)', async () => {
    mockOffGrid.on = true;
    (global as any).fetch = jest.fn();
    const r = await funFactAttempt(['sea life']);
    expect(r).toMatchObject({ kind: 'none', why: 'off-grid' });
    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(noFunFactMessage(r as any)).toMatch(/Off-grid mode is on/);
  });

  it('says why when there is nothing: the pages were found but none was suitable', async () => {
    wiki({ Mercury: { extract: 'Mercury may refer to: the planet, the element, the Roman god, or a record label, among others.' } }, ['Mercury']);
    const r = await funFactAttempt(['planets']);
    expect(r).toMatchObject({ kind: 'none', why: 'nothing-suitable', tried: ['planets'] });
    expect(noFunFactMessage(r as any)).toMatch(/none was a suitable article/);
  });

  it('never tries more than three interests', async () => {
    wiki({}, []);
    const r = await funFactAttempt(['a', 'b', 'c', 'd', 'e']);
    expect((r as any).tried).toHaveLength(3);
  });

  it('previewFunFact still returns the fact or null', async () => {
    wiki({ Octopus: { extract: ARTICLE } }, ['Octopus']);
    expect((await previewFunFact(['sea life']))?.page).toBe('Wikipedia: Octopus');
    expect(await previewFunFact([])).toBeNull();
  });
});
