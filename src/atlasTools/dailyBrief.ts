/**
 * Daily briefing: a short spoken news show about the user's interests, with fun facts.
 * Online: fresh headlines (news RSS feeds) + the top article for each interest.
 * Offline / off-grid: an "offline edition" from the offline library instead.
 * The episode is written by the model on the phone and saved like a study podcast.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Source, StudyResult, useStudyStore, writeEpisode, trimSources } from '../study/engine';

export const BRIEF_PROJECT = 'daily-brief';

interface BriefPrefs {
  interests: string[];
  minutes: number;
  hosts: 1 | 2;
  funFacts: boolean;
  /** also read the top article per interest (slower, more detail) */
  deep: boolean;
  setInterests: (v: string[]) => void;
  set: (p: Partial<Pick<BriefPrefs, 'minutes' | 'hosts' | 'funFacts' | 'deep'>>) => void;
}

export const useBriefPrefs = create<BriefPrefs>()(persist((set) => ({
  interests: ['world news', 'science', 'technology'],
  minutes: 5,
  hosts: 2,
  funFacts: true,
  deep: true,
  setInterests: (interests) => set({ interests }),
  set: (p) => set(p),
}), { name: 'atlas-daily-brief', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ interests: s.interests, minutes: s.minutes, hosts: s.hosts, funFacts: s.funFacts, deep: s.deep }) }));

/** "I like space, the Bears and cooking" -> ['space', 'the Bears', 'cooking'] */
export function parseInterests(text: string): string[] {
  const cleaned = text.replace(/^\s*(i\s+(really\s+)?(like|love|enjoy|follow|am into|'m into)|my interests are|interests?:)\s*/i, '');
  const parts = cleaned.split(/,|;|\n|\band\b|&|\//i).map((x) => x.replace(/^\s*(also|plus)\s+/i, '').replace(/[.!]+$/, '').trim()).filter((x) => x.length > 1 && x.length < 60);
  return [...new Set(parts.map((p) => p.toLowerCase()))].map((l) => parts.find((p) => p.toLowerCase() === l)!).slice(0, 12);
}

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const briefings = (): StudyResult[] => useStudyStore.getState().saved[BRIEF_PROJECT] || [];
export const todaysBrief = (): StudyResult | undefined => briefings().find((r) => todayKey(new Date(r.createdAt)) === todayKey());

const decode = (t: string) => t
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();

interface Headline { title: string; desc: string; url?: string; source?: string; date?: number }

async function fetchText(url: string, ms = 12000): Promise<string> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

function parseRss(xml: string): Headline[] {
  const out: Headline[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const tag = (n: string) => it.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, 'i'))?.[1] ?? '';
    const title = decode(tag('title'));
    if (!title) continue;
    const date = Date.parse(decode(tag('pubDate')));
    out.push({ title, desc: decode(tag('description')).slice(0, 400), url: decode(tag('link')) || undefined, source: decode(tag('source')) || undefined, date: isNaN(date) ? undefined : date });
  }
  return out;
}

/** Fresh headlines for one interest: Bing News RSS (has summaries + direct links), Google News RSS as backup. */
async function headlines(topic: string): Promise<Headline[]> {
  const q = encodeURIComponent(topic);
  const feeds = [
    `https://www.bing.com/news/search?q=${q}&format=rss`,
    `https://news.google.com/rss/search?q=${q}%20when:2d&hl=en-US&gl=US&ceid=US:en`,
  ];
  for (const f of feeds) {
    try {
      const items = parseRss(await fetchText(f));
      if (items.length) {
        const weekAgo = Date.now() - 7 * 864e5;
        return items.filter((h) => !h.date || h.date > weekAgo).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 4);
      }
    } catch { /* try the next feed */ }
  }
  return [];
}

async function libraryFacts(topic: string, startN: number): Promise<Source[]> {
  try {
    const { searchLibrary, readArticle } = require('./offlineLibrary');
    const hits = await searchLibrary(topic, 2);
    const out: Source[] = [];
    for (const h of hits.slice(0, 1)) {
      const a = await readArticle(h.uri, h.path, 1400);
      out.push({ n: startN + out.length, doc: `${h.library}: ${a.title}`, part: 1, text: a.text.replace(/\s+/g, ' ').slice(0, 1200), origin: 'library' });
    }
    return out;
  } catch { return []; }
}

/** Builds today's briefing and saves it. */
export async function makeBriefing(onStep: (m: string) => void, voicesAvailable: number): Promise<StudyResult> {
  const p = useBriefPrefs.getState();
  const interests = p.interests.length ? p.interests : ['world news'];
  let offline = false;
  try { offline = require('./offGrid').offGridOn(); } catch { /* ignore */ }

  const sources: Source[] = [];
  const add = (s: Omit<Source, 'n'>) => sources.push({ ...s, n: sources.length + 1 });
  let gotNews = false;
  if (!offline) {
    for (const topic of interests.slice(0, 8)) {
      onStep(`Checking news: ${topic}...`);
      const hs = await headlines(topic);
      if (!hs.length) continue;
      gotNews = true;
      const block = hs.map((h) => `- ${h.title}${h.source ? ` (${h.source})` : ''}${h.date ? ` [${new Date(h.date).toLocaleDateString()}]` : ''}${h.desc && h.desc !== h.title ? `: ${h.desc}` : ''}`).join('\n');
      add({ doc: `News: ${topic}`, part: 1, text: block.slice(0, 1400), origin: 'web', url: hs[0].url });
      if (p.deep && hs[0].url && !/news\.google\.com/.test(hs[0].url)) {
        try {
          onStep(`Reading the top ${topic} story...`);
          const { readPage } = require('../services/tools/handlers');
          const txt: string = await readPage(hs[0].url, 2500);
          if (txt && txt.length > 300) add({ doc: hs[0].title, part: 1, text: txt.replace(/\s+/g, ' ').slice(0, 1600), origin: 'web', url: hs[0].url });
        } catch { /* headline is enough */ }
      }
    }
  }
  if (p.funFacts || !gotNews) {
    onStep(gotNews ? 'Finding fun facts in the offline library...' : 'No internet - making an offline edition from your library...');
    for (const topic of interests.slice(0, gotNews ? 3 : 6)) {
      for (const s of await libraryFacts(topic, sources.length + 1)) add({ ...s });
    }
  }
  if (!sources.length) {
    throw new Error(offline
      ? 'Off-grid mode is on and the offline library has nothing on your interests yet. Turn off off-grid mode, or download a library pack in Offline library.'
      : 'Could not reach the news and found nothing in the offline library. Check your internet connection and try again.');
  }

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const trimmed = trimSources(sources);
  const r = await writeEpisode(trimmed, {
    title: `${gotNews ? 'Daily briefing' : 'Offline edition'} - ${date}`,
    prompt: gotNews
      ? `A daily news briefing for ${date}. Go story by story through the most important and interesting news in the sources for these interests: ${interests.join(', ')}. Say where news comes from (the outlet) when it is given. Do not invent news that is not in the sources.`
      : `An "offline edition" for ${date}: there is no live news today, so explore interesting things from the sources about these interests: ${interests.join(', ')}.`,
    minutes: p.minutes,
    hosts: voicesAvailable >= 2 ? p.hosts : 1,
    style: 'news',
    research: false,
    funFacts: p.funFacts,
  }, onStep);
  useStudyStore.getState().add(BRIEF_PROJECT, r);
  return r;
}
