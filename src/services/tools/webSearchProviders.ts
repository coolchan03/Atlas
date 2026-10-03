import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Atlas: choose where the web_search tool gets results from.
 * Keys and URLs stay on the phone (AsyncStorage). If the chosen provider fails,
 * DuckDuckGo and then Brave are tried so search keeps working.
 */
export type SearchProvider = 'brave' | 'duckduckgo' | 'searxng' | 'exa' | 'parallel' | 'tavily';

export const PROVIDERS: { id: SearchProvider; name: string; needs: 'none' | 'url' | 'key'; note: string }[] = [
  { id: 'searxng', name: 'SearXNG', needs: 'url', note: 'Your own or a public SearXNG server. JSON output must be enabled on the server (search.formats: json).' },
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
  setResults: (n: number) => void;
}

export const useSearchSettings = create<SearchSettings>()(
  persist(
    (set) => ({
      provider: 'duckduckgo',
      searxngUrl: '',
      keys: {},
      results: 5,
      setProvider: (provider) => set({ provider }),
      setSearxngUrl: (searxngUrl) => set({ searxngUrl: searxngUrl.trim().replace(/\/+$/, '') }),
      setKey: (p, k) => set((s) => ({ keys: { ...s.keys, [p]: k.trim() } })),
      setResults: (results) => set({ results }),
    }),
    { name: 'atlas-search-settings', storage: createJSONStorage(() => AsyncStorage) },
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

const RUNNERS: Partial<Record<SearchProvider, (q: string, n: number) => Promise<WebResult[]>>> = {
  searxng, duckduckgo, exa, parallel, tavily,
};

/**
 * Search with the chosen provider; on failure or no results fall back to DuckDuckGo,
 * then to the built-in Brave page search (`braveFallback`).
 */
export async function searchWeb(q: string, braveFallback: (q: string) => Promise<WebResult[]>): Promise<{ results: WebResult[]; provider: string; notes: string[] }> {
  const { provider, results: n } = useSearchSettings.getState();
  const order: SearchProvider[] = [provider, 'duckduckgo', 'brave'].filter((p, i, a) => a.indexOf(p) === i) as SearchProvider[];
  const notes: string[] = [];
  for (const p of order) {
    try {
      const res = p === 'brave' ? await braveFallback(q) : await RUNNERS[p]!(q, n);
      if (res.length) return { results: res.slice(0, n), provider: p, notes };
      notes.push(`${p}: no results`);
    } catch (e: any) {
      notes.push(`${p}: ${String(e?.message || e).slice(0, 80)}`);
    }
  }
  return { results: [], provider: provider, notes };
}
