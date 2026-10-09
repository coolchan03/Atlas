import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

/**
 * Atlas: choose where the web_search tool gets results from.
 * API keys use OS Keychain; non-secret settings use AsyncStorage. If the chosen provider fails,
 * the built-in metasearch, DuckDuckGo and then Brave are tried so search keeps working.
 */
export type SearchProvider = 'meta' | 'brave' | 'duckduckgo' | 'searxng' | 'exa' | 'parallel' | 'tavily';

export const PROVIDERS: { id: SearchProvider; name: string; needs: 'none' | 'url' | 'key'; note: string }[] = [
  { id: 'meta', name: 'Built-in metasearch', needs: 'none', note: 'Like SearXNG, but inside the app: asks DuckDuckGo, Brave, Mojeek and Wikipedia at the same time and merges the results. No server, no key.' },
  { id: 'searxng', name: 'SearXNG server', needs: 'url', note: 'Your own or a public SearXNG server. JSON output must be enabled on the server (search.formats: json).' },
  { id: 'duckduckgo', name: 'DuckDuckGo', needs: 'none', note: 'Free, no key.' },
  { id: 'brave', name: 'Brave (web page)', needs: 'none', note: 'Free, no key. The original built-in search.' },
  { id: 'exa', name: 'Exa (AI search)', needs: 'key', note: 'API key from dashboard.exa.ai. Returns page text, good for AI answers.' },
  { id: 'parallel', name: 'Parallel (AI search)', needs: 'key', note: 'API key from platform.parallel.ai. Returns relevant excerpts.' },
  { id: 'tavily', name: 'Tavily (AI search)', needs: 'key', note: 'API key from app.tavily.com.' },
];

interface SearchSettings {
  provider: SearchProvider;
  searxngUrl: string;
  keys: Partial<Record<SearchProvider, string>>;
  results: number;
  setProvider: (p: SearchProvider) => void;
  setSearxngUrl: (u: string) => void;
  setKey: (p: SearchProvider, k: string) => void;
  loadSecureKeys: () => Promise<void>;
  setResults: (n: number) => void;
}

export const useSearchSettings = create<SearchSettings>()(
  persist(
    (set) => ({
      provider: 'meta',
      searxngUrl: '',
      keys: {},
      results: 5,
      setProvider: (provider) => set({ provider }),
      setSearxngUrl: (searxngUrl) => set({ searxngUrl: searxngUrl.trim().replace(/\/+$/, '') }),
      setKey: (p, k) => {
        const value = k.trim();
        set((s) => ({ keys: { ...s.keys, [p]: value } }));
        const service = `ai.offgridmobile.search.${p}`;
        const operation = value
          ? Keychain.setGenericPassword(p, value, { service, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED })
          : Keychain.resetGenericPassword({ service });
        operation.catch(() => { /* Secure storage failure is surfaced on next search. */ });
      },
      loadSecureKeys: async () => {
        const current = useSearchSettings.getState().keys;
        const restored: Partial<Record<SearchProvider, string>> = {};
        for (const p of ['exa', 'parallel', 'tavily'] as SearchProvider[]) {
          const service = `ai.offgridmobile.search.${p}`;
          try {
            const credentials = await Keychain.getGenericPassword({ service });
            if (credentials) restored[p] = credentials.password;
            else if (current[p]) {
              await Keychain.setGenericPassword(p, current[p]!, { service, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED });
              restored[p] = current[p];
            }
          } catch (_error) { /* Avoid losing existing credentials if Keychain is unavailable. */ }
        }
        useSearchSettings.setState({ keys: { ...current, ...restored } });
      },
      setResults: (results) => set({ results }),
    }),
    { name: 'atlas-search-settings', storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ provider: state.provider, searxngUrl: state.searxngUrl, results: state.results }),
      onRehydrateStorage: () => (state) => { void state?.loadSecureKeys(); },
    },
  ),
);

export type WebResult = { title: string; snippet: string; url?: string };

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

async function timed(url: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const cut = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n)}...` : s);

async function searxng(q: string, n: number): Promise<WebResult[]> {
  const base = useSearchSettings.getState().searxngUrl;
  if (!base) throw new Error('No SearXNG address set (Tools screen).');
  const r = await timed(`${base}/search?q=${encodeURIComponent(q)}&format=json`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  const j: any = await r.json();
  return (j.results || []).slice(0, n).map((x: any) => ({ title: x.title || x.url, url: x.url, snippet: cut(x.content || '') }));
}

async function duckduckgo(q: string, n: number): Promise<WebResult[]> {
  const r = await timed(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  const html = await r.text();
  const out: WebResult[] = [];
  const blocks = html.split(/class="result__body"|class="result results_links/).slice(1);
  for (const b of blocks) {
    if (out.length >= n) break;
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = decode(a[1]);
    const ud = url.match(/[?&]uddg=([^&]+)/);
    if (ud) url = decodeURIComponent(ud[1]);
    if (url.startsWith('//')) url = `https:${url}`;
    if (/duckduckgo\.com\/y\.js/.test(url)) continue; // ads
    const sn = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    out.push({ title: strip(a[2]), url, snippet: sn ? strip(sn[1]) : '' });
  }
  return out;
}

async function exa(q: string, n: number): Promise<WebResult[]> {
  const key = useSearchSettings.getState().keys.exa;
  if (!key) throw new Error('No Exa API key set.');
  const r = await timed('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ query: q, numResults: n, contents: { text: { maxCharacters: 800 } } }),
  }, 20000);
  const j: any = await r.json();
  return (j.results || []).map((x: any) => ({ title: x.title || x.url, url: x.url, snippet: cut(x.text || (x.highlights || []).join(' ') || '') }));
}

async function parallel(q: string, n: number): Promise<WebResult[]> {
  const key = useSearchSettings.getState().keys.parallel;
  if (!key) throw new Error('No Parallel API key set.');
  const r = await timed('https://api.parallel.ai/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ objective: q, search_queries: [q], mode: 'fast' }),
  }, 20000);
  const j: any = await r.json();
  return (j.results || []).slice(0, n).map((x: any) => ({ title: x.title || x.url, url: x.url, snippet: cut((x.excerpts || []).join(' ')) }));
}

async function tavily(q: string, n: number): Promise<WebResult[]> {
  const key = useSearchSettings.getState().keys.tavily;
  if (!key) throw new Error('No Tavily API key set.');
  const r = await timed('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: q, max_results: n }),
  }, 20000);
  const j: any = await r.json();
  return (j.results || []).map((x: any) => ({ title: x.title || x.url, url: x.url, snippet: cut(x.content || '') }));
}

async function mojeek(q: string, n: number): Promise<WebResult[]> {
  const r = await timed(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  const html = await r.text();
  const out: WebResult[] = [];
  const blocks = html.split(/<li class="r\d*"|<li class="r /).slice(1);
  for (const b of blocks) {
    if (out.length >= n) break;
    const a = b.match(/<a[^>]*class="title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) || b.match(/<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const sn = b.match(/<p class="s">([\s\S]*?)<\/p>/);
    out.push({ title: strip(a[2]), url: decode(a[1]), snippet: sn ? strip(sn[1]) : '' });
  }
  return out;
}

async function wikipedia(q: string, n: number): Promise<WebResult[]> {
  const r = await timed(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${Math.min(n, 3)}&srsearch=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'OffGridAtlas/1.0' } });
  const j: any = await r.json();
  return (j.query?.search || []).map((x: any) => ({
    title: `${x.title} - Wikipedia`,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(x.title).replace(/ /g, '_'))}`,
    snippet: strip(x.snippet || ''),
  }));
}

const norm = (u?: string) =>
  (u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

/** SearXNG-style: query several engines in parallel, merge, dedupe, rank by agreement. */
async function meta(q: string, n: number, braveFallback?: (q: string) => Promise<WebResult[]>): Promise<WebResult[]> {
  const engines: [string, Promise<WebResult[]>][] = [
    ['DuckDuckGo', duckduckgo(q, 8)],
    ['Mojeek', mojeek(q, 8)],
    ['Wikipedia', wikipedia(q, 3)],
  ];
  if (braveFallback) engines.push(['Brave', braveFallback(q)]);
  const settled = await Promise.allSettled(engines.map((e) => e[1]));
  const merged = new Map<string, WebResult & { score: number; engines: string[] }>();
  settled.forEach((res, ei) => {
    if (res.status !== 'fulfilled') return;
    res.value.forEach((r, rank) => {
      const key = norm(r.url) || r.title.toLowerCase();
      const cur = merged.get(key);
      const add = 1 / (rank + 1);
      if (cur) {
        cur.score += add + 0.5; // found by more than one engine = more trustworthy
        cur.engines.push(engines[ei][0]);
        if (r.snippet.length > cur.snippet.length) cur.snippet = r.snippet;
      } else {
        merged.set(key, { ...r, score: add, engines: [engines[ei][0]] });
      }
    });
  });
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((r) => ({ title: r.title, url: r.url, snippet: `${r.snippet}${r.snippet ? ' ' : ''}(found by ${r.engines.join(', ')})` }));
}

const RUNNERS: Partial<Record<SearchProvider, (q: string, n: number) => Promise<WebResult[]>>> = {
  searxng, duckduckgo, exa, parallel, tavily,
};

/**
 * Search with the chosen provider; on failure or no results fall back to DuckDuckGo,
 * then to the built-in Brave page search (`braveFallback`).
 */
export async function searchWeb(q: string, braveFallback: (q: string) => Promise<WebResult[]>): Promise<{ results: WebResult[]; provider: string; notes: string[] }> {
  const { provider, results: n } = useSearchSettings.getState();
  // Privacy: a provider you chose on purpose (your own SearXNG, or a keyed AI search) never silently
  // hands the query to someone else. The free public engines back each other up.
  const order: SearchProvider[] = (
    provider === 'meta' ? ['meta']
      : provider === 'duckduckgo' ? ['duckduckgo', 'brave']
        : provider === 'brave' ? ['brave', 'duckduckgo']
          : [provider]
  ) as SearchProvider[];
  const notes: string[] = [];
  for (const p of order) {
    try {
      const res = p === 'brave' ? await braveFallback(q) : p === 'meta' ? await meta(q, n, braveFallback) : await RUNNERS[p]!(q, n);
      if (res.length) return { results: res.slice(0, n), provider: p, notes };
      notes.push(`${p}: no results`);
    } catch (e: any) {
      notes.push(`${p}: ${String(e?.message || e).slice(0, 80)}`);
    }
  }
  return { results: [], provider: provider, notes };
}
