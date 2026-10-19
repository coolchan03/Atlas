/**
 * Choosing real news for the daily briefing.
 *
 * Broad interests ("world news", "United States", "business") use Google News's top-stories
 * sections, which are edited news from established outlets. Specific interests use a recent
 * Google News search, with Bing News as a fallback. Press releases, sponsored posts and
 * shopping/deal items are dropped, near-duplicate stories are merged, and only the last two
 * days count, so a "daily" briefing is about today's news.
 */
export interface Headline { title: string; desc: string; url?: string; source?: string; date?: number }

const GN = 'hl=en-US&gl=US&ceid=US:en';

/** Google News section for a broad interest, or null for a specific one. */
export function sectionFor(interest: string): string | null {
  const t = ` ${interest.toLowerCase().replace(/[^a-z. ]+/g, ' ')
    .replace(/\b(news|headlines|top|latest|stories|today|the|current events?)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()} `;
  const rules: [RegExp, string][] = [
    [/ (world|international|global|foreign|worldwide) /, 'WORLD'],
    [/ (u\.?s\.?a?\.?|united states|us|national|america|american|domestic) /, 'NATION'],
    [/ (business|economy|economic|markets?|finance|financial) /, 'BUSINESS'],
    [/ (technology|tech) /, 'TECHNOLOGY'],
    [/ (science|space) /, 'SCIENCE'],
    [/ (health|medicine|medical) /, 'HEALTH'],
    [/ (sports?) /, 'SPORTS'],
    [/ (entertainment|movies|celebrity|celebrities|tv) /, 'ENTERTAINMENT'],
  ];
  if (t.trim() === '') return 'NATION'; // just "news"
  return rules.find(([re]) => re.test(t))?.[1] ?? null;
}

/** Feeds to try for an interest, best first. */
export function feedsFor(interest: string): string[] {
  const section = sectionFor(interest);
  const q = encodeURIComponent(interest);
  return [
    ...(section ? [`https://news.google.com/rss/headlines/section/topic/${section}?${GN}`] : []),
    `https://news.google.com/rss/search?q=${q}%20when:2d&${GN}`,
    `https://www.bing.com/news/search?q=${q}&format=rss`,
  ];
}

const PR_WIRES = /pr ?newswire|globe ?newswire|business ?wire|access ?wire|accessnewswire|ein ?presswire|newsfile|openpr|prweb|24-7 press release|press ?release|newswire\.com|marketersmedia|issuewire|prlog|send2press|prfire/i;
const AD_WORDS = /\b(sponsored|advertis(e|ement|ing)|paid (post|content|partner)|partner content|promo(tion)? code|coupons?|discount code|\d+% off|deals? (of|on|for) |black friday deals|best .{1,40} to buy|top \d+ .{1,40} (to buy|you can buy)|shop now|buy now|limited[- ]time offer|giveaway|webinar|free trial)\b/i;

/** True for press releases, sponsored posts and shopping/deal items, which are not news. */
export function isPromotional(h: Pick<Headline, 'title' | 'desc' | 'source' | 'url'>): boolean {
  const where = `${h.source ?? ''} ${h.url ?? ''}`;
  if (PR_WIRES.test(where)) return true;
  return AD_WORDS.test(h.title) || AD_WORDS.test(h.desc.slice(0, 200));
}

/** Google News titles end in " - Outlet": move the outlet into `source`. */
export function splitOutlet(h: Headline): Headline {
  const m = h.title.match(/^(.*\S)\s+[-–]\s+([^-–]{2,60})$/);
  if (!m) return h;
  return { ...h, title: m[1], source: h.source || m[2] };
}

const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2));

/** Word overlap between two headlines (0..1): same story from different outlets scores high. */
export function similarity(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  A.forEach((w) => { if (B.has(w)) shared++; });
  return shared / Math.min(A.size, B.size);
}

export const FRESH_MS = 48 * 3600e3;

/** Fresh, non-promotional, de-duplicated headlines, newest first. */
export function cleanHeadlines(items: Headline[], now = Date.now(), seen: string[] = []): Headline[] {
  const out: Headline[] = [];
  for (const raw of items) {
    const h = splitOutlet(raw);
    if (!h.title || isPromotional(h)) continue;
    if (h.date && now - h.date > FRESH_MS) continue;
    if ([...seen, ...out.map((o) => o.title)].some((t) => similarity(t, h.title) >= 0.6)) continue;
    out.push(h);
  }
  return out.sort((a, b) => (b.date || 0) - (a.date || 0));
}

/** About one story a minute, at least three and at most ten. */
export const storyBudget = (minutes: number) => Math.max(3, Math.min(10, Math.round(minutes)));

/** Spreads the story budget over the interests in turn, so every interest is covered. */
export function pickStories(perInterest: Headline[][], budget: number): { interest: number; headline: Headline }[] {
  const picked: { interest: number; headline: Headline }[] = [];
  for (let round = 0; picked.length < budget; round++) {
    let added = false;
    perInterest.forEach((list, interest) => {
      if (picked.length < budget && list[round]) { picked.push({ interest, headline: list[round] }); added = true; }
    });
    if (!added) break;
  }
  return picked;
}
