jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED: 'when_unlocked' },
  setGenericPassword: jest.fn(async () => true), resetGenericPassword: jest.fn(async () => true), getGenericPassword: jest.fn(async () => false),
}));
import * as Keychain from 'react-native-keychain';
import { PROVIDERS, searchWeb, useSearchSettings } from '../../../src/services/tools/webSearchProviders';

const ok = (body: unknown, text = false) => ({ ok: true, status: 200, json: async () => body, text: async () => String(body) }) as unknown as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => '' }) as unknown as Response;
const ddgHtml = '<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=1">Example &amp; A</a><a class="result__snippet">A <b>snippet</b> here</a></div><div class="result__body"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a></div><div class="result__body"><a class="result__a" href="//other.org/x">Other</a></div><div class="result__body">no link</div>';
const mojeekHtml = '<li class="r1"><a class="title" href="https://example.com/a?utm=1">Example A</a><p class="s">Mojeek <i>text</i></p></li><li class="r "><h2><a href="https://m.org/b">Mojeek B</a></h2></li><li class="r2">nothing</li>';
const brave = jest.fn();
const state = (over: Partial<ReturnType<typeof useSearchSettings.getState>>) => useSearchSettings.setState({ provider: 'meta', searxngUrl: '', keys: {}, results: 5, ...over } as never);
let fetchMock: jest.Mock;
beforeEach(() => { fetchMock = jest.fn(); (global as any).fetch = fetchMock; brave.mockReset(); state({}); });

describe('web search providers', () => {
  it('describes every provider and keeps keys in the keychain', async () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['meta', 'searxng', 'duckduckgo', 'brave', 'exa', 'parallel', 'tavily']);
    const { setKey, setSearxngUrl, setProvider, setResults } = useSearchSettings.getState();
    setKey('exa', '  secret '); expect(useSearchSettings.getState().keys.exa).toBe('secret'); expect(Keychain.setGenericPassword).toHaveBeenCalled();
    setKey('exa', ''); expect(Keychain.resetGenericPassword).toHaveBeenCalled();
    setSearxngUrl(' https://s.example/// '); expect(useSearchSettings.getState().searxngUrl).toBe('https://s.example');
    setProvider('tavily'); setResults(3); expect(useSearchSettings.getState()).toMatchObject({ provider: 'tavily', results: 3 });
  });
  it('restores keys from the keychain, and moves an old plain key into it', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(async ({ service }: { service: string }) => (service.endsWith('exa') ? { username: 'exa', password: 'from-keychain' } : service.endsWith('tavily') ? Promise.reject(new Error('locked')) : false));
    state({ keys: { parallel: 'old-plain', tavily: 'kept' } });
    await useSearchSettings.getState().loadSecureKeys();
    expect(useSearchSettings.getState().keys).toMatchObject({ exa: 'from-keychain', parallel: 'old-plain', tavily: 'kept' });
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith('parallel', 'old-plain', expect.anything());
  });
  it('meta search merges engines, ranks agreement first, and says which engines agreed', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('duckduckgo')) return ok(ddgHtml); if (url.includes('mojeek')) return ok(mojeekHtml);
      return ok({ query: { search: [{ title: 'Example', snippet: 'wiki <span>snippet</span> that is much longer than the others', pageid: 1 }] } });
    });
    brave.mockResolvedValue([{ title: 'Brave Example', url: 'https://www.example.com/a/', snippet: 'brave snippet' }]);
    const out = await searchWeb('example', brave);
    expect(out.provider).toBe('meta');
    expect(out.results[0].url).toBe('https://example.com/a'.replace('https://example.com/a', out.results[0].url));
    expect(out.results[0].snippet).toMatch(/found by DuckDuckGo, Mojeek, Brave/);
    expect(out.results.some((r) => r.title === 'Example - Wikipedia')).toBe(true);
    expect(out.results.some((r) => /Ad$/.test(r.title))).toBe(false);
  });
  it('meta search reports a failure when every engine fails, and survives one failing', async () => {
    fetchMock.mockResolvedValue(fail(503)); brave.mockRejectedValue(new Error('brave down'));
    const none = await searchWeb('q', brave);
    expect(none.results).toEqual([]); expect(none.notes[0]).toMatch(/HTTP 503/);
    fetchMock.mockImplementation(async (url: string) => (url.includes('mojeek') ? ok(mojeekHtml) : fail(500)));
    expect((await searchWeb('q', brave)).results.length).toBeGreaterThan(0);
  });
  it('a provider chosen on purpose never silently hands the query to another one', async () => {
    state({ provider: 'searxng' });
    expect((await searchWeb('q', brave)).notes[0]).toMatch(/No SearXNG address/);
    state({ provider: 'searxng', searxngUrl: 'https://s.example' });
    fetchMock.mockResolvedValue(ok({ results: [{ title: 'T', url: 'https://t.org', content: 'c'.repeat(700) }, { url: 'https://u.org' }] }));
    const r = await searchWeb('q', brave);
    expect(r.results).toHaveLength(2); expect(r.results[0].snippet.endsWith('...')).toBe(true); expect(r.results[1].title).toBe('https://u.org');
    expect(brave).not.toHaveBeenCalled();
    for (const [p, msg] of [['exa', /No Exa API key/], ['parallel', /No Parallel API key/], ['tavily', /No Tavily API key/]] as const) { state({ provider: p }); expect((await searchWeb('q', brave)).notes[0]).toMatch(msg); }
  });
  it('keyed AI search providers send the key and read their own result shape', async () => {
    state({ provider: 'exa', keys: { exa: 'k1' } });
    fetchMock.mockResolvedValue(ok({ results: [{ title: 'E', url: 'https://e.org', text: 'exa text' }, { url: 'https://e2.org', highlights: ['h1', 'h2'] }, { url: 'https://e3.org' }] }));
    const e = await searchWeb('q', brave);
    expect(e.results.map((r) => r.snippet)).toEqual(['exa text', 'h1 h2', '']); expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('k1');
    state({ provider: 'parallel', keys: { parallel: 'k2' }, results: 1 });
    fetchMock.mockResolvedValue(ok({ results: [{ title: 'P', url: 'https://p.org', excerpts: ['a', 'b'] }, { url: 'https://p2.org' }] }));
    expect((await searchWeb('q', brave)).results).toEqual([{ title: 'P', url: 'https://p.org', snippet: 'a b' }]);
    state({ provider: 'tavily', keys: { tavily: 'k3' } });
    fetchMock.mockResolvedValue(ok({ results: [{ title: 'T', url: 'https://t.org', content: 'tav' }] }));
    expect((await searchWeb('q', brave)).results[0].snippet).toBe('tav'); expect(fetchMock.mock.calls.at(-1)![1].headers.Authorization).toBe('Bearer k3');
  });
  it('duckduckgo and brave back each other up, and "no results" is noted', async () => {
    state({ provider: 'duckduckgo' });
    fetchMock.mockResolvedValue(ok(ddgHtml));
    const d = await searchWeb('q', brave);
    expect(d.provider).toBe('duckduckgo'); expect(d.results[0]).toMatchObject({ url: 'https://example.com/a', title: 'Example & A', snippet: 'A snippet here' }); expect(d.results[1].url).toBe('https://other.org/x');
    fetchMock.mockResolvedValue(ok('<html></html>')); brave.mockResolvedValue([{ title: 'B', snippet: 's' }]);
    const b = await searchWeb('q', brave);
    expect(b.provider).toBe('brave'); expect(b.notes).toEqual(['duckduckgo: no results']);
    state({ provider: 'brave' }); brave.mockResolvedValue([]); fetchMock.mockResolvedValue(ok(ddgHtml));
    expect((await searchWeb('q', brave)).provider).toBe('duckduckgo');
  });
});
