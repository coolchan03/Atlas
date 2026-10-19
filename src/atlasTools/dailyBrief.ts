/**
 * Daily briefing: a short spoken news show about the user's interests, with fun facts.
 * Online: fresh headlines (news RSS feeds) + the top article for each interest.
 * Offline / off-grid: an "offline edition" from the offline library instead.
 * The episode is written by the model on the phone and saved like a study podcast.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Source, StudyResult, useStudyStore, writeEpisode } from '../study/engine';
import { cleanHeadlines, feedsFor, isPromotional, pickStories, similarity, splitOutlet, storyBudget, type Headline } from './newsSources';

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

async function fetchText(url: string, ms = 12000): Promise<string> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

export function parseRss(xml: string): Headline[] {
  const out: Headline[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const tag = (n: string) => it.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, 'i'))?.[1] ?? '';
    const title = decode(tag('title'));
    if (!title) continue;
    const date = Date.parse(decode(tag('pubDate')));
    out.push({ title, desc: decode(tag('description')).slice(0, 400), url: decode(tag('link')) || undefined, source: decode(tag('source') || tag('News:Source')) || undefined, date: isNaN(date) ? undefined : date });
  }
  return out;
}

/** Fresh real headlines for one interest, from the first feed that has any (see newsSources). */
async function headlines(topic: string, seen: string[]): Promise<Headline[]> {
  for (const f of feedsFor(topic)) {
    try {
      const items = cleanHeadlines(parseRss(await fetchText(f)), Date.now(), seen);
      if (items.length) return items.slice(0, 6);
    } catch { /* try the next feed */ }
  }
  return [];
}

/**
 * More detail for one story: the same story in Bing News (a summary and a direct link, since
 * Google News links are redirects), then optionally the article itself.
 */
async function storyDetail(h: Headline, deep: boolean): Promise<{ text: string; url?: string }> {
  let summary = '';
  let url = h.url && !/news\.google\.com/.test(h.url) ? h.url : undefined;
  try {
    const match = parseRss(await fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(h.title)}&format=rss`, 8000))
      .map(splitOutlet).find((x) => !isPromotional(x) && similarity(x.title, h.title) >= 0.5);
    if (match) { summary = match.desc; url = url || match.url; }
  } catch { /* the headline alone is enough */ }
  let article = '';
  if (deep && url) {
    try {
      const { readPage } = require('../services/tools/handlers');
      const txt: string = await readPage(url, 2500);
      if (txt && txt.length > 300) article = txt.replace(/\s+/g, ' ').slice(0, 1600);
    } catch { /* summary is enough */ }
  }
  return { text: [summary, article].filter(Boolean).join('\n'), url };
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

type OutlineItem = { topic: string; sources: Source[] };

function storyHeader(h: Headline): string {
  const when = h.date ? new Date(h.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  return [`Headline: ${h.title}`, h.source && `Outlet: ${h.source}`, when && `Published: ${when}`].filter(Boolean).join('\n');
}

/** One outline item for one real story: its headline, outlet, time and any detail found. */
async function storyItem({ h, interest, deep, n }: { h: Headline; interest: string; deep: boolean; n: number }): Promise<OutlineItem> {
  const detail = await storyDetail(h, deep);
  const outlet = h.source ? ` (${h.source})` : '';
  return {
    topic: `${h.title}${outlet} - ${interest}`,
    sources: [{ n, doc: h.source || 'News', part: 1, text: `${storyHeader(h)}\n${detail.text || h.desc || ''}`.slice(0, 1800), origin: 'web', url: detail.url || h.url }],
  };
}

/** Library items: one fun fact with the news, or several for an offline edition. */
async function libraryItems(interests: string[], withNews: boolean, firstN: number): Promise<OutlineItem[]> {
  const out: OutlineItem[] = [];
  let n = firstN;
  for (const topic of interests.slice(0, withNews ? 2 : 6)) {
    const facts = await libraryFacts(topic, n);
    if (!facts.length) continue;
    n += facts.length;
    out.push({ topic: withNews ? `A fun fact about ${topic} from the offline library` : `From the offline library: ${topic}`, sources: facts });
    if (withNews) break;
  }
  return out;
}

/** Builds today's briefing from real, current stories and saves it. */
export async function makeBriefing(onStep: (m: string) => void, voicesAvailable: number): Promise<StudyResult> {
  const p = useBriefPrefs.getState();
  const interests = p.interests.length ? p.interests : ['world news'];
  let offline = false;
  try { offline = require('./offGrid').offGridOn(); } catch { /* ignore */ }

  // 1. Real headlines for each interest (top-story sections for broad ones), no ads or press releases.
  const perInterest: Headline[][] = [];
  if (!offline) {
    const seen: string[] = [];
    for (const topic of interests.slice(0, 8)) {
      onStep(`Checking news: ${topic}...`);
      const hs = await headlines(topic, seen);
      perInterest.push(hs);
      hs.forEach((h) => seen.push(h.title));
    }
  }
  const stories = pickStories(perInterest, storyBudget(p.minutes));

  // 2. One part per story, written only from that story's own sources.
  const outline: OutlineItem[] = [];
  for (const [i, { interest, headline }] of stories.entries()) {
    onStep(`Reading story ${i + 1} of ${stories.length}: ${headline.title.slice(0, 50)}...`);
    outline.push(await storyItem({ h: headline, interest: interests[interest], deep: p.deep, n: outline.length + 1 }));
  }

  // 3. Fun facts come only from the offline library, never from the model's memory.
  const gotNews = outline.length > 0;
  if (p.funFacts || !gotNews) {
    onStep(gotNews ? 'Finding a fun fact in the offline library...' : 'No news - making an offline edition from your library...');
    outline.push(...await libraryItems(interests, gotNews, outline.length + 1));
  }
  if (!outline.length) {
    throw new Error(offline
      ? 'Off-grid mode is on and the offline library has nothing on your interests yet. Turn off off-grid mode, or download a library pack in Offline library.'
      : 'Could not reach the news and found nothing in the offline library. Check your internet connection and try again.');
  }

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const r = await writeEpisode([], {
    title: `${gotNews ? 'Daily briefing' : 'Offline edition'} - ${date}`,
    prompt: gotNews
      ? `A daily news briefing for ${date} on: ${interests.join(', ')}. Each item is one real story: say what happened and name the outlet. Report only what its source says.`
      : `An "offline edition" for ${date}: there is no live news today, so share interesting things from the library about: ${interests.join(', ')}.`,
    minutes: p.minutes,
    hosts: voicesAvailable >= 2 ? p.hosts : 1,
    style: 'news',
    research: false,
    funFacts: false,
    outline,
  }, onStep);
  r.headlines = stories.map(({ interest, headline: h }, i) => ({
    title: h.title, source: h.source, date: h.date, interest: interests[interest], url: outline[i]?.sources[0]?.url || h.url,
  }));
  useStudyStore.getState().add(BRIEF_PROJECT, r);
  return r;
}
