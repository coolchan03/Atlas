/**
 * Daily briefing: a short spoken news show about the user's interests, with fun facts.
 * Online: fresh headlines (news RSS feeds) + the top article for each interest.
 * Offline / off-grid: an "offline edition" from the offline library instead.
 * The episode is written by the model on the phone and saved like a study podcast.
 */
import { scrubTeasers } from './briefingScrub';
import { clearBriefTrace, noteBriefTrace } from '../atlasVoice/briefTrace';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Source, StudyResult, askModel, useStudyStore, writeEpisode } from '../study/engine';
import { HEADLINE_ONLY_NOTE, WORDS_PER_MINUTE, americaCentric, avoided, funFactTopics, isViolentStory, namesOutlet, wantsViolentNews, isThinDetail, cleanHeadlines, feedsFor, isPromotional, linesPerStory, onTopic, parseScreenReply, pickStories, screenPrompt, similarity, splitOutlet, spokenMinutes, storyBudget, type Headline } from './newsSources';

export const BRIEF_PROJECT = 'daily-brief';
/** The quiet beat after the chime before each story starts, so every story lands before the next. */
export const STORY_PAUSE_SECONDS = 3;
import { readCalendarContext, calendarSummary, calendarSpoken, type CalendarContext } from './calendarBrief';
import { daySpoken } from './dayBrief';
import { packForTomorrow, reviewsDueSpoken, streakLine, weeklyDigest } from './dayExtras';
import { nudgeOn } from './nudges';

interface BriefPrefs {
  interests: string[];
  minutes: number;
  hosts: 1 | 2;
  funFacts: boolean;
  /** also read the top article per interest (slower, more detail) */
  deep: boolean;
  /** Topics to leave out of the briefing entirely. */
  avoid: string[];
  /** Each topic presented by its own expert, with the anchor handing over. */
  experts: boolean;
  /** A short tune before and after the show. */
  jingles: boolean;
  /** How loud the opening, closing and story tunes are. */
  jingleVolume: 'quiet' | 'normal' | 'loud';
  /** How fast the briefing is played (1 is as recorded; faster also raises the voices a little). */
  speed: 0.8 | 1 | 1.25;
  /** The briefing line the person last reached, to carry on from. */
  listened: { key: string; line: number } | null;
  setInterests: (v: string[]) => void;
  set: (p: Partial<Pick<BriefPrefs, 'minutes' | 'hosts' | 'funFacts' | 'deep' | 'avoid' | 'experts' | 'jingles' | 'jingleVolume' | 'speed' | 'listened'>>) => void;
}

export const useBriefPrefs = create<BriefPrefs>()(persist((set) => ({
  interests: ['world news', 'science', 'technology'],
  minutes: 5,
  hosts: 2,
  funFacts: true,
  deep: true,
  avoid: [],
  experts: false,
  jingles: true,
  jingleVolume: 'normal',
  speed: 1,
  listened: null,
  setInterests: (interests) => set({ interests }),
  set: (p) => set(p),
}), { name: 'atlas-daily-brief', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ interests: s.interests, minutes: s.minutes, hosts: s.hosts, funFacts: s.funFacts, deep: s.deep, avoid: s.avoid, experts: s.experts, jingles: s.jingles, jingleVolume: s.jingleVolume, speed: s.speed, listened: s.listened }) }));

const EXPERT_NAMES = ['Maya', 'Theo', 'Priya', 'Marcus', 'Lena', 'Omar', 'Grace', 'Sam'];

/**
 * Cast for one part when each topic has its own expert: the anchor (A) introduces that
 * topic's expert by name, who explains the story. Experts alternate between voices B and C.
 */
export function expertCast(interest: string, index: number): string {
  const voice = index % 2 === 0 ? 'B' : 'C';
  return `A (the anchor) and ${voice} (${EXPERT_NAMES[index % EXPERT_NAMES.length]}, our ${interest} expert). A introduces ${EXPERT_NAMES[index % EXPERT_NAMES.length]} by name the first time, then ${voice} explains the story and A asks a short follow-up. Only A and ${voice} speak in this part.`;
}

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

/** Fresh real headlines that fit one interest, from the first feed that has any (see newsSources). */
async function headlines({ topic, interests, seen, want }: { topic: string; interests: string[]; seen: string[]; want: number }): Promise<Headline[]> {
  const need = Math.max(6, want);
  const found: Headline[] = [];
  // The first feed with stories is not always enough for a long briefing: keep going through the feeds until there are enough.
  for (const f of feedsFor(topic)) {
    try {
      const fromSection = f.includes('/headlines/section/');
      const items = onTopic(cleanHeadlines(parseRss(await fetchText(f)), Date.now(), [...seen, ...found.map((h) => h.title)]), { interest: topic, interests, fromSection });
      found.push(...items.filter((h) => !found.some((x) => similarity(x.title, h.title) >= 0.5)));
      if (found.length >= need) break;
    } catch { /* try the next feed */ }
  }
  return found.slice(0, need);
}

/** A few of today's real headlines on a topic (for the language course's news square). */
export const latestHeadlines = (topic: string, want: number): Promise<Headline[]> =>
  headlines({ topic, interests: [topic], seen: [], want }).then((h) => h.slice(0, want));

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
      if (txt && txt.length > 300) article = txt.replace(/\s+/g, ' ').slice(0, 900);
    } catch { /* summary is enough */ }
  }
  return { text: [summary, article].filter(Boolean).join('\n'), url };
}

async function libraryFacts(topic: string, startN: number): Promise<Source[]> {
  try {
    const { searchLibrary, readArticle } = require('./offlineLibrary');
    const hits = await searchLibrary(topic, 4);
    const out: Source[] = [];
    for (const h of hits.slice(0, 4)) {
      if (out.length) break;
      const a = await readArticle(h.uri, h.path, 1400);
      if (americaCentric(a.title, a.text)) continue; // facts are from anywhere, not only the United States
      out.push({ n: startN + out.length, doc: `${h.library}: ${a.title}`, part: 1, text: a.text.replace(/\s+/g, ' ').slice(0, 1200), origin: 'library' });
    }
    return out;
  } catch { return []; }
}

/** An article's first sentence is its definition ("The United States is a country in..."), which is no fun fact: with three or more sentences the first is dropped. */
function withoutDefinition(extract: string): string {
  const sentences = extract.split(/(?<=[.!?])\s+(?=[A-Z])/); // a full stop inside U.S. or 2.5 is not a sentence end
  return sentences.length >= 3 && sentences[0].length > 40 ? sentences.slice(1).join(' ').trim() : extract;
}

/** A page title that would only repeat the topic or is a list, index or disambiguation page: not a fact worth telling. */
const dullTitle = (title: string, topic: string): boolean =>
  title.toLowerCase() === topic.toLowerCase() || /^(list|lists|outline|index|timeline|history) of\b|\(disambiguation\)|^portal:|^(president|vice president|prime minister|government|politics|economy|geography|demographics|culture) of\b/i.test(title);

/**
 * Why a Wikipedia page cannot be the source of a fun fact, or '' when it can. Looked at by what the page SAYS, not only its title: a page that
 * "may refer to" several things, a stub, a redirect notice, a page that is not an article, or text that is mostly not words tells nothing true or specific.
 */
export function unsuitableExtract(title: string, text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (/^(?:category|template|file|help|wikipedia|portal|draft|talk|user|module):/i.test(title)) return 'it is not an article';
  if (t.length < 50) return 'it is too short to hold a fact';
  if (/\b(?:may|can) (?:also )?refer to\b|\brefers to:?\s*$|^this is a disambiguation/i.test(t.slice(0, 220))) return 'it is a page that lists several meanings';
  if (/\b(?:is a redirect|redirects here|this (?:article|page) is a stub)\b/i.test(t.slice(0, 300))) return 'it is a redirect or stub';
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters < t.length * 0.5) return 'it is mostly numbers or symbols, not sentences';
  if (!/[.!?]/.test(t)) return 'it has no complete sentence';
  return '';
}

async function wikiSummary(title: string): Promise<{ title: string; text: string } | null> {
  const json = JSON.parse(await fetchText(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, 8000));
  if (json.type === 'disambiguation') return null;
  const page = { title: json.title || title, text: (json.extract || '').trim() };
  return unsuitableExtract(page.title, page.text) ? null : page; // an unsuitable page is passed over, so another one is tried
}

/**
 * A fun fact is about something specific the topic touches, not the topic itself (nobody learns anything from "the United States is a
 * country"): one of the pages Wikipedia finds for the topic is picked at random (three tries at most) and told without its opening definition. The topic's own
 * page is the fallback when search finds nothing.
 */
async function webFacts(topic: string, startN: number): Promise<Source[]> {
  const make = (page: { title: string; text: string }, definition: boolean): Source[] => {
    const text = (definition ? withoutDefinition(page.text) : page.text).slice(0, 1200);
    return text.length < 50 || americaCentric(page.title, text) ? [] : [{ n: startN, doc: `Wikipedia: ${page.title}`, part: 1, text, origin: 'web' }];
  };
  try {
    // The best matches are the famous pages everyone knows, so the search starts a random way down its results (and falls back to the top when that is empty).
    const search = async (offset: number): Promise<string[]> => {
      const found = JSON.parse(await fetchText(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=12&sroffset=${offset}&format=json&origin=*`, 8000));
      return (found?.query?.search ?? []).map((r: { title: string }) => r.title).filter((t: string) => !dullTitle(t, topic)).slice(0, 8);
    };
    const offset = Math.floor(Math.random() * 6) * 6;
    let titles = await search(offset);
    if (!titles.length && offset) titles = await search(0);
    for (let tries = 0; titles.length && tries < 3; tries++) {
      const [title] = titles.splice(Math.floor(Math.random() * titles.length), 1);
      try {
        const page = await wikiSummary(title);
        const facts = page ? make(page, true) : [];
        if (facts.length) return facts;
      } catch { /* try another page */ }
    }
  } catch { /* fall back to the topic's own page */ }
  try {
    const page = await wikiSummary(topic);
    return page ? make(page, true) : [];
  } catch { return []; }
}

/** The source a fun fact would be told from for one interest right now (library first, then a related Wikipedia page), or null. For the preview on the briefing screen. */
export async function previewFunFact(interests: string[]): Promise<{ topic: string; page: string; text: string } | null> {
  const result = await funFactAttempt(interests);
  return result.kind === 'found' ? result.fact : null;
}

export type FunFactResult =
  | { kind: 'found'; fact: { topic: string; page: string; text: string } }
  | { kind: 'none'; why: 'no-interests' | 'off-grid' | 'offline' | 'nothing-suitable'; tried: string[] };

/**
 * One fun fact for the preview. Several interests are tried (in random order, up to three) before giving up, and when nothing comes back the
 * result says why: no interests, off-grid mode, no connection, or pages that were found but were not suitable.
 */
export async function funFactAttempt(interests: string[], tries = 3): Promise<FunFactResult> {
  const order = funFactTopics(interests);
  if (!order.length) return { kind: 'none', why: 'no-interests', tried: [] };
  const tried: string[] = [];
  let connectionFailed = false;
  for (const topic of order.slice(0, Math.max(1, tries))) {
    tried.push(topic);
    const fromLibrary = (await libraryFacts(topic, 1))[0];
    if (fromLibrary) return { kind: 'found', fact: { topic, page: fromLibrary.doc, text: fromLibrary.text.slice(0, 600) } };
    if (offGridNow()) continue;
    try {
      const fromWeb = (await webFacts(topic, 1))[0];
      if (fromWeb) return { kind: 'found', fact: { topic, page: fromWeb.doc, text: fromWeb.text.slice(0, 600) } };
    } catch { connectionFailed = true; }
  }
  return { kind: 'none', why: offGridNow() ? 'off-grid' : connectionFailed ? 'offline' : 'nothing-suitable', tried };
}

/** The sentence the preview shows when no fact came back: the real reason, and what the person can do. */
export function noFunFactMessage(result: Extract<FunFactResult, { kind: 'none' }>): string {
  switch (result.why) {
    case 'no-interests': return 'No topic to look in.';
    case 'off-grid': return 'Off-grid mode is on, so Wikipedia is not used. Only the offline library was searched, and it had nothing on these interests.';
    case 'offline': return 'The phone could not reach Wikipedia. Check the connection and press again.';
    default: return `Pages were found for ${result.tried.join(', ')}, but none was a suitable article for a fun fact. Press again to try other pages or interests.`;
  }
}

type OutlineItem = { topic: string; sources: Source[]; always?: boolean };

function storyHeader(h: Headline, outlet: boolean): string {
  const when = h.date ? new Date(h.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  return [`Headline: ${h.title}`, outlet && h.source && `Outlet: ${h.source}`, when && `Published: ${when}`].filter(Boolean).join('\n');
}

/** One outline item for one real story: its headline, outlet, time and any detail found. */
async function storyItem({ h, interest, deep, n }: { h: Headline; interest: string; deep: boolean; n: number }): Promise<OutlineItem> {
  let detail = await storyDetail(h, deep);
  // A story with little more than its headline gets one more try: the article itself.
  if (!deep && isThinDetail(detail.text || h.desc || '', h.title)) detail = await storyDetail(h, true);
  const thin = isThinDetail(detail.text || h.desc || '', h.title);
  // The model is only told the outlet for one story in five (the others cannot name it), so the show does not say where every story came from.
  const outletName = namesOutlet(n) ? h.source : undefined;
  const named = !!outletName;
  return {
    topic: `${h.title}${outletName ? ` (${outletName})` : ''} - ${interest}`,
    sources: [{ n, doc: outletName || 'News', part: 1, text: `${storyHeader(h, named)}\n${detail.text || h.desc || ''}${thin ? `\n${HEADLINE_ONLY_NOTE}` : ''}`.slice(0, 1800), origin: 'web', url: detail.url || h.url }],
  };
}

/** Library items: one fun fact with the news, or several for an offline edition. */
async function libraryItems(interests: string[], withNews: boolean, firstN: number): Promise<OutlineItem[]> {
  const out: OutlineItem[] = [];
  let n = firstN;
  // With the news, the fun fact comes from a random science or nature area (the interests are only the fallback), so it is not about the same country as the news.
  for (const topic of withNews ? funFactTopics(interests).slice(0, 3) : interests.slice(0, 6)) {
    let facts = await libraryFacts(topic, n);
    let factSource = 'offline library';
    if (!facts.length && withNews && !offGridNow()) {
      facts = await webFacts(topic, n);
      factSource = 'Wikipedia';
    }
    if (!facts.length) continue;
    n += facts.length;
    out.push({ topic: withNews ? `An obscure fun fact from ${factSource}, connected to ${topic}: a niche detail most people have never heard (an odd record, a forgotten first, a strange origin, a number that surprises). Never a definition of what ${topic} or the page's subject is, and never common knowledge such as who holds an office, a capital city, a famous person's job or what a well-known thing is` : `From the offline library: ${topic}`, sources: facts, always: true });
    if (withNews) break;
  }
  return out;
}

type Picked = { interest: number; headline: Headline };

/**
 * Word lists miss stories ("Chiefs beat Bills" never says sports), so the AI on the phone also reads the headlines and names
 * the ones about a topic the listener wants left out. Returns the positions to drop; if the AI cannot be asked, the word
 * lists alone have to do.
 */
export async function aiScreen(titles: string[], avoid: string[]): Promise<Set<number>> {
  if (!avoid.length || !titles.length) return new Set();
  const drop = new Set<number>();
  try {
    for (let from = 0; from < titles.length; from += 25) {
      const batch = titles.slice(from, from + 25);
      const { system, user } = screenPrompt(batch, avoid);
      parseScreenReply(await askModel(system, user), batch.length).forEach((i) => drop.add(from + i));
    }
  } catch { /* the word lists already ran */ }
  return drop;
}

/**
 * Real headlines for each interest (top-story sections for broad ones), no ads, press
 * releases or avoided topics, read one by one until what the stories can carry adds up to the
 * chosen length. Twice the planned number are fetched, so thin stories can be topped up.
 */
async function gatherStories(o: { interests: string[]; minutes: number; deep: boolean; avoid: string[] }, onStep: (m: string) => void): Promise<{ outline: OutlineItem[]; stories: Picked[] }> {
  const { interests, minutes, deep, avoid } = o;
  const budget = storyBudget(minutes, deep);
  const topics = interests.slice(0, 8);
  onStep(`Checking the news (${topics.length} topic${topics.length === 1 ? '' : 's'})...`);
  // Every topic's feeds are fetched at once; stories told twice are dropped below.
  const perInterest: Headline[][] = (await Promise.all(topics.map((topic) =>
    headlines({ topic, interests, seen: [], want: Math.ceil((budget * 2) / topics.length) + 2 }))))
    .map((hs) => hs.filter((h) => !avoided(h, avoid)));
  if (avoid.length) {
    onStep('Checking the headlines against your topics to avoid...');
    const flat = perInterest.flatMap((list, interest) => list.map((h) => ({ interest, h })));
    const dropped = await aiScreen(flat.map(({ h }) => h.title), avoid);
    const gone = new Set([...dropped].map((i) => flat[i].h));
    perInterest.forEach((list, k) => { perInterest[k] = list.filter((h) => !gone.has(h)); });
  }
  // A few more than the length needs are read, so the script can keep going until it really reaches the length.
  const want = Math.min(50, budget + 4);
  const picked: Picked[] = [];
  // Stories about killings, shootings and deadly crashes go to the back of each topic's list, and only about one in ten of the calm stories' number is let through, unless a topic asks for them.
  const calm = !wantsViolentNews(interests);
  if (calm) perInterest.forEach((list, k) => { perInterest[k] = [...list.filter((h) => !isViolentStory(h)), ...list.filter(isViolentStory)]; });
  const calmCount = perInterest.reduce((n, list) => n + list.filter((h) => !isViolentStory(h)).length, 0);
  const violentCap = Math.max(1, Math.floor(calmCount / 9)); // about one in ten of what is told, however few stories there are
  let violent = 0;
  for (const pick of pickStories(perInterest, Math.min(80, budget * 2))) {
    if (picked.length >= want) break;
    if (calm && isViolentStory(pick.headline)) { if (violent >= violentCap) continue; violent += 1; }
    // The same event under another outlet's wording is one card, not two.
    if (picked.some((x) => similarity(x.headline.title, pick.headline.title) >= 0.5 || (!!x.headline.url && !/news\.google\.com/.test(x.headline.url) && x.headline.url === pick.headline.url))) continue;
    picked.push(pick);
  }
  // Story details (a summary, optionally the article) are fetched a few at a time instead of one after another.
  // Only the story number is shown: a headline would spoil the show.
  const outline: OutlineItem[] = new Array(picked.length);
  const BATCH = 5;
  for (let from = 0; from < picked.length; from += BATCH) {
    const batch = picked.slice(from, from + BATCH);
    onStep(`Reading stories ${from + 1}-${from + batch.length} of ${picked.length}...`);
    await Promise.all(batch.map(async (pick, k) => {
      outline[from + k] = await storyItem({ h: pick.headline, interest: interests[pick.interest], deep, n: from + k + 1 });
    }));
  }
  return { outline, stories: picked };
}

function offGridNow(): boolean { try { return require('./offGrid').offGridOn(); } catch { return false; } }

/** The interests to cover: those that are not themselves something to avoid (by word lists, then by asking the AI). */
async function wantedInterests(all: string[], avoid: string[]): Promise<string[]> {
  const byWords = all.filter((i) => !avoided({ title: i, desc: '' }, avoid));
  const byAi = avoid.length && !offGridNow() ? await aiScreen(byWords, avoid) : new Set<number>();
  const wanted = byWords.filter((_, k) => !byAi.has(k));
  return wanted.length ? wanted : ['world news'];
}

const NO_WELCOME = 'Do not greet listeners, welcome them, name the show or say the date or the time of day: the opening greeting is added for you. Start straight into the first story, never repeat a line. Move between stories with a transition of one to four words ("Next.", "Also.", "In other news."). Never say what comes next, never talk about the show, the headlines or the stories as a whole, and never promise more detail, a video, a link or another segment: say what the story says and stop. Speak as a reporter relaying the news: name the outlet at most once per story, in its first line, and for only about half the stories (most just state the news), worded differently each time ("Reuters says...", "per the BBC", "as the Times reports"), never every story and never "according to" twice in a row. Never write "the report", "the article" or "the story" ("The report details how...") and never begin two lines in the same way. Never say "I" or "we" about what happened, and never read a headline out as if it were your own words or in quotation marks. Give every story its own two to four sentences of detail, never just the headline. Never tell the listener what to think or feel about a story. Skip items that are not genuine news: personal obituaries of private individuals, promotional announcements, and minor local notices with no wider significance.';

/** The opening line, made here so the date is always said first (the model was leaving it out or putting it mid-show). */
export function greetingLine(now = new Date()): string {
  const part = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `Good ${part}. Today is ${date}. This is your briefing.`;
}
/** Rules every part of the briefing must follow. */
const briefingRules = (avoid: string[], gotNews: boolean): string | undefined =>
  [avoid.length ? `Never bring up: ${avoid.join(', ')}.` : '', gotNews ? NO_WELCOME : ''].filter(Boolean).join(' ') || undefined;

/** Builds today's briefing from real, current stories and saves it. */
export async function makeBriefing(onStep: (m: string) => void, voicesAvailable: number): Promise<StudyResult> {
  clearBriefTrace();
  const p = useBriefPrefs.getState();
  const interests = await wantedInterests(p.interests, p.avoid ?? []);
  let offline = false;
  try { offline = require('./offGrid').offGridOn(); } catch { /* ignore */ }

  // Read today's calendar events for flight/travel context (best-effort).
  let calendarNote = '';
  let calendarFlights: { raw: string; airline: string }[] = [];
  let calendarCtx: CalendarContext | null = null;
  try {
    const calCtx = await readCalendarContext();
    calendarCtx = calCtx;
    if (calCtx) { calendarNote = calendarSummary(calCtx); calendarFlights = calCtx.flights; }
  } catch { /* non-critical */ }

  // Fetch weather early so it can be mentioned in the briefing.
  let weatherLine = '';
  let weatherSaid = '';
  let packSaid = '';
  if (!offline) {
    try {
      const { fetchWeather, weatherSummary, weatherSpoken } = require('./weather');
      const { useMaps } = require('../atlasMaps/maps');
      const { currentUnits } = require('./units');
      // The position is only kept once Maps has been opened, so read the phone's last known one first.
      try { await require('../atlasMaps/locationNote').refreshLastFix(); } catch { /* use what is kept */ }
      const fix = useMaps.getState().lastFix;
      if (fix) {
        const w = await fetchWeather(fix.lat, fix.lon);
        if (w) {
          weatherLine = weatherSummary(w, undefined, currentUnits()); weatherSaid = weatherSpoken(w, currentUnits());
          if (nudgeOn('packTomorrow')) packSaid = packForTomorrow({ today: w, tomorrow: w.tomorrow, units: currentUnits(), hour: new Date().getHours() });
        }
      }
    } catch { /* weather is optional */ }
  }

  const avoid = p.avoid ?? [];
  const { outline, stories } = offline ? { outline: [] as OutlineItem[], stories: [] as Picked[] }
    : await gatherStories({ interests, minutes: p.minutes, deep: p.deep, avoid }, onStep);

  // 3. Fun facts come from the offline library when available, falling back to Wikipedia when online.
  const gotNews = outline.length > 0;
  if (p.funFacts || !gotNews) {
    onStep(gotNews ? 'Finding a fun fact...' : 'No news - making an offline edition from your library...');
    outline.push(...await libraryItems(interests, gotNews, outline.length + 1));
  }
  if (!outline.length) {
    throw new Error(offline
      ? 'Off-grid mode is on and the offline library has nothing on your interests yet. Turn off off-grid mode, or download a library pack in Offline library.'
      : 'Could not reach the news and found nothing in the offline library. Check your internet connection and try again.');
  }

  // Fetch live flight status for any flights detected in the calendar (best-effort).
  if (!offline && calendarFlights.length) {
    const { fetchFlightStatus } = require('./calendarBrief');
    for (const flight of calendarFlights) {
      onStep(`Checking flight ${flight.raw} status...`);
      try {
        const statusText: string | null = await fetchFlightStatus(flight.raw);
        if (statusText) {
          outline.push({
            topic: `Flight ${flight.raw} (${flight.airline}) live status`,
            sources: [{ n: outline.length + 1, doc: 'Flight tracking', part: 1, text: statusText, origin: 'web' }],
            always: true,
          });
        }
      } catch { /* non-critical */ }
    }
  }

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const rules = briefingRules(avoid, gotNews);
  const withExperts = p.experts && gotNews && voicesAvailable >= 2;
  let usedStories = stories.length;
  const r = await writeEpisode([], {
    title: `${gotNews ? 'Daily briefing' : 'Offline edition'} - ${date}`,
    prompt: gotNews
      ? `A daily news briefing for ${date} on: ${interests.join(', ')}. Each item is one real story: summarize it in your own words in two to four sentences (what happened, who is involved); do not say which outlet reported it unless the item names one. Never read an article aloud or quote it, and report only what its source says.${weatherLine ? ` At the start, briefly mention the weather: ${weatherLine}` : ''}${calendarNote ? ` The listener has these plans today: ${calendarNote}${calendarFlights.length ? ' Live flight status is included in the sources - read it and report the current status (on time, delayed, gate, etc.) when covering their flight.' : ''} Mention their travel naturally when relevant.` : ''}`
      : `An "offline edition" for ${date}: there is no live news today, so share interesting things from the library about: ${interests.join(', ')}.${weatherLine ? ` Briefly mention the weather: ${weatherLine}` : ''}${calendarNote ? ` Mention the listener's plans: ${calendarNote}` : ''}`,
    minutes: p.minutes,
    hosts: withExperts ? 3 : voicesAvailable >= 2 ? p.hosts : 1,
    rules,
    noWelcome: gotNews,
    castFor: withExperts ? (i) => (stories[i] ? expertCast(interests[stories[i].interest], stories[i].interest) : undefined) : undefined,
    style: 'news',
    research: false,
    funFacts: false,
    outline,
    // Enough lines per story that the stories add up to the length the user picked.
    // Planned from the stories actually found: with fewer than the length needs, each one is told in more depth.
    linesPerItem: linesPerStory(p.minutes, stories.length || storyBudget(p.minutes, p.deep), 12),
    targetWords: p.minutes * WORDS_PER_MINUTE,
    onItemsUsed: (count) => { usedStories = count; },
  }, onStep);
  // After the date come the weather, the day's calendar and the day's scheduled tasks, as fixed lines (the model left them out when only asked).
  // From 5 pm the briefing looks ahead: tomorrow's calendar and tasks instead of today's.
  const evening = new Date().getHours() >= 17;
  // Teasers the model made up ("next we will see what else is making headlines", "watch the video after the briefing") are taken out.
  if (r.podcast) {
    const clean = scrubTeasers(r.podcast, r.storyStarts ?? []);
    r.podcast = clean.lines;
    if (r.storyStarts) r.storyStarts = clean.starts;
    if (r.storyItems) r.storyItems = clean.keptStarts.map((i) => r.storyItems![i]);
    // What the quality check found, kept for "What just happened": stories told from a headline alone, teasers taken out, and the fun fact's page.
    const thin = outline.filter((o) => o.sources.some((x) => x.text.includes(HEADLINE_ONLY_NOTE))).map((o) => o.topic.split(' - ')[0]);
    const fact = outline.find((o) => o.always)?.sources[0]?.doc;
    noteBriefTrace(`[BRIEF] ${r.storyStarts?.length ?? 0} stories, ${r.podcast.length} lines; ${thin.length ? `told from the headline alone: ${thin.join('; ')}` : 'every story had detail'}; ${clean.removed} teaser line${clean.removed === 1 ? '' : 's'} taken out${fact ? `; fun fact from ${fact}` : ''}`);
  }
  const opening = [gotNews ? greetingLine() : '', weatherSaid, packSaid, calendarSpoken(calendarCtx, { birthdays: nudgeOn('birthdays'), day: evening ? 'tomorrow' : 'today' }), yourDay(evening ? 'tomorrow' : 'today')].filter(Boolean);
  if (r.podcast) r.podcast = [...opening.map((text) => ({ host: 'A' as const, text })), ...r.podcast];
  // The opening lines come first, so every story start moves down by that many lines.
  if (r.storyStarts) r.storyStarts = r.storyStarts.map((n) => n + opening.length);
  r.storyFirstLine = opening.length;
  r.minutes = Math.max(1, Math.round(spokenMinutes((r.podcast ?? []).map((l) => l.text))));
  r.headlines = stories.slice(0, usedStories).map(({ interest, headline: h }, i) => ({
    title: h.title, source: h.source, date: h.date, interest: interests[interest], url: outline[i]?.sources[0]?.url || h.url,
  }));
  useStudyStore.getState().add(BRIEF_PROJECT, r);
  preRenderBriefing(r);
  return r;
}

/**
 * The spoken "your day" lines: scheduled tasks later today and a low-battery heads-up, a study streak, and a Monday digest of last week. Best-effort: never stops the briefing. Private material (incognito or locked chats, protected projects) is left out.
 */
function yourDay(when: 'today' | 'tomorrow' = 'today'): string {
  const now = Date.now();
  const parts: string[] = [];
  try {
    const { useSchedule } = require('../schedule/store');
    const { useLowPower } = require('./lowPowerState');
    const power = useLowPower.getState();
    if (nudgeOn('yourDay')) parts.push(daySpoken({ tasks: useSchedule.getState().tasks, now, batteryPercent: power.battery, charging: power.charging, when }));
  } catch { /* no schedule */ }
  try {
    const saved: Record<string, StudyResult[]> = useStudyStore.getState().saved;
    const { useProjectStore } = require('../stores/projectStore');
    const name = (id: string): string => useProjectStore.getState().getProject?.(id)?.name ?? 'your notes';
    const open = (id: string): boolean => { const pr = useProjectStore.getState().getProject?.(id); return !(pr?.pinVerifier || pr?.protectedBlob); }; // never name a protected project
    const items = Object.entries(saved).filter(([project]) => project !== BRIEF_PROJECT && open(project))
      .flatMap(([project, results]) => results.map((r) => ({ at: r.createdAt, project: name(project) })));
    const progress = require('../study/progress');
    if (nudgeOn('studyStreak')) parts.push(streakLine(progress.streakFrom(progress.useStudyProgress.getState().doneDays)));
    if (nudgeOn('reviewsDue')) parts.push(reviewsDueSpoken(progress.dueItems(null, now, 1000).filter((d: { projectId: string }) => open(d.projectId)).map((d: { projectId: string }) => ({ project: name(d.projectId) }))));
    if (nudgeOn('weeklyDigest')) parts.push(weeklyDigest(items, now));
  } catch { /* no study history */ }
  return parts.filter(Boolean).join(' ');
}

/** Saves the briefing's audio in the background now, so it starts at once and plays without gaps. */
function preRenderBriefing(r: StudyResult): void {
  try {
    const { listVoices } = require('../atlasVoice/tts');
    const { castLine, preRenderEpisode } = require('../atlasVoice/podcastAudio');
    listVoices('en').then((voices: { name: string }[]) => preRenderEpisode(`${BRIEF_PROJECT}-${r.createdAt}`,
      (r.podcast ?? []).map((l) => ({ text: l.text, ...castLine(l.host, r.hosts ?? 2, voices) }))))
      .catch(() => undefined);
  } catch { /* no voice engine: it is spoken live */ }
}
