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

const FRESH_MS = 48 * 3600e3;

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

/** Spoken words per minute used to size the briefing to the chosen length. */
export const WORDS_PER_MINUTE = 150;

/**
 * How many stories fill the chosen length. Each story is a short summary (about 60 spoken words, 40 without
 * reading the article), not a full read of it. At least three, at most forty-five (thirty was too few for a 15 minute show: the stories
 * found could not carry it, and the briefing stopped near 12 minutes).
 */
export const storyBudget = (minutes: number, deep = true) =>
  Math.max(3, Math.min(45, Math.round((minutes * WORDS_PER_MINUTE) / (deep ? 60 : 40))));

/** Script lines per story (about 20 spoken words each) so the stories add up to the chosen length. */
export const linesPerStory = (minutes: number, stories: number, cap = 8) =>
  Math.max(2, Math.min(cap, Math.ceil((minutes * WORDS_PER_MINUTE) / Math.max(1, stories) / 20)));

/** Estimated listening time of a script, in minutes. */
export const spokenMinutes = (texts: string[]) =>
  texts.reduce((n, t) => n + t.split(/\s+/).filter(Boolean).length, 0) / WORDS_PER_MINUTE;

const SPORTS = /\b(nfl|nba|wnba|mlb|nhl|mls|ncaa|big ten|espn|playoffs?|postseason|preseason|quarterback|touchdown|field goal|home runs?|innings?|world series|super bowl|stanley cup|grand slam|wimbledon|premier league|champions league|la liga|serie a|bundesliga|coach(es|ing)?|draft picks?|halftime|game \d|series opener|season opener|regular season|transfer window|formula 1|f1|nascar|ufc|boxing|wrestling|olympics?|world cup|golf|pga|tennis|soccer|football|baseball|basketball|hockey|volleyball|softball|athletes?|pitcher|striker|linebacker|goalkeeper|rookie|roster|mvp|all-star|free agen(t|cy)|trade deadline|tournament|championships?|semifinals?|quarterfinals?|varsity|scoreboard|box score|standings|league)\b/i;

/** Team nicknames and scorelines: most sports headlines ("Chiefs beat Bills 27-20") never use a sports word. */
const TEAMS = /\b(chiefs|bills|bengals|ravens|browns|steelers|texans|colts|jaguars|broncos|raiders|chargers|dolphins|patriots|cowboys|commanders|packers|bears|lions|vikings|falcons|buccaneers|49ers|niners|seahawks|rams|cardinals|lakers|celtics|warriors|knicks|sixers|76ers|bucks|cavaliers|cavs|pistons|pacers|hornets|raptors|wizards|nuggets|timberwolves|blazers|clippers|mavericks|mavs|grizzlies|pelicans|yankees|red sox|dodgers|cubs|white sox|astros|braves|mets|phillies|padres|brewers|pirates|orioles|blue jays|guardians|tigers|royals|mariners|nationals|marlins|rockies|diamondbacks|bruins|canadiens|maple leafs|blackhawks|penguins|flyers|oilers|canucks|avalanche|panthers|golden knights|red wings|manchester united|man city|liverpool|arsenal|chelsea|tottenham|barcelona|real madrid|juventus|bayern|psg|inter miami)\b/i;
const SCORELINE = /\b\d{1,3}\s?[-–]\s?\d{1,3}\b.*\b(win|wins|beat|beats|defeat|defeats|rout|routs|edge|edges|top|tops|lose|loses|lost|rally|rallies|upset|upsets)\b|\b(win|wins|beat|beats|defeat|defeats|rout|routs|edge|edges|tops?|lose|loses|lost|rally|rallies|upset|upsets)\b.*\b\d{1,3}\s?[-–]\s?\d{1,3}\b/i;
const isSportsText = (t: string) => SPORTS.test(t) || SCORELINE.test(t) || (TEAMS.test(t) && /\b(game|win|wins|beat|beats|loss|lose|season|team|play|plays|score|scores|trade|signs?|injur\w+|coach|playoffs?|rally|rallies|defeat\w*|edge|edges|vs|versus)\b/i.test(t));
const ENTERTAINMENT = /\b(box office|celebrit(y|ies)|album|grammys?|oscars?|emmys?|netflix|trailer|red carpet|reality tv|kardashians?|taylor swift|concert tour|movie review|tv series|streaming hit)\b/i;
const CATEGORY: Record<'SPORTS' | 'ENTERTAINMENT', { test: (t: string) => boolean }> = { SPORTS: { test: isSportsText }, ENTERTAINMENT };
const POLITICS = /\b(congress|senate|senators?|house (republicans|democrats)|democrats?|republicans?|gop|white house|election|midterms?|campaign trail|governors?|legislat(ure|ion|ors?)|supreme court|impeach\w*|lawmakers?|partisan|ballots?|primary (election|race)|prime minister|parliament)\b/i;
const CRIME = /\b(murder(ed|s)?|shooting|shot dead|stabb(ed|ing)|arrest(ed|s)?|homicide|robbery|kidnapp\w*|manslaughter|police say|suspects?|sentenced|convicted|indicted|manhunt|carjacking|assault(ed)?)\b/i;

/**
 * Words a person types under "Topics to avoid" that mean a whole kind of story rather than a keyword. A headline
 * about the Bears never contains the word "sports", so avoiding "sports" must look for what sports stories are about.
 */
const AVOID_KINDS: { label: string; topic: RegExp; content: RegExp }[] = [
  { label: 'Sports', topic: /\b(sports?|sporting|athletics?)\b/, content: { test: isSportsText } as unknown as RegExp },
  { label: 'Celebrity gossip', topic: /\b(celebrit\w*|gossip|entertainment|showbiz|hollywood)\b/, content: ENTERTAINMENT },
  { label: 'Politics', topic: /\b(politics?|political)\b/, content: POLITICS },
  { label: 'Crime', topic: /\bcrimes?\b/, content: CRIME },
];
/** Topics offered as one-tap suggestions on the briefing screen. */
export const AVOID_SUGGESTIONS = AVOID_KINDS.map((k) => k.label);

/** The kinds of story a headline is (Sports, Politics...), by what it is about: to offer "avoid this kind". */
export function storyKinds(h: Pick<Headline, 'title' | 'desc'>): string[] {
  const text = `${h.title} ${h.desc.slice(0, 200)}`;
  return AVOID_KINDS.filter((k) => k.content.test(text)).map((k) => k.label);
}

/**
 * Broad sections such as U.S. or world news mix in sports and celebrity stories. Those are
 * dropped unless one of the user's interests is about them (a section or a matching name).
 */
function unwantedCategory(h: Pick<Headline, 'title' | 'desc'>, interests: string[]): boolean {
  const text = `${h.title} ${h.desc.slice(0, 200)}`;
  return (Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).some((cat) =>
    CATEGORY[cat].test(text) && !interests.some((i) => sectionFor(i) === cat || CATEGORY[cat].test(i)));
}

const STOP = new Set(['the', 'and', 'news', 'about', 'with', 'from', 'latest', 'today', 'update', 'updates', 'stories']);

/** A search result really is about the interest: it names at least one of its words. */
function mentions(h: Pick<Headline, 'title' | 'desc'>, interest: string): boolean {
  const keys = interest.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!keys.length) return true;
  const text = `${h.title} ${h.desc}`.toLowerCase();
  return keys.some((k) => text.includes(k.length > 4 ? k.slice(0, -1) : k));
}

/**
 * Keeps only stories that fit this interest: no sports or celebrity items unless an interest
 * is about them (in sections and in searches alike: a search for a city or a state is mostly
 * its teams' results otherwise), and search results that really name the interest.
 */
export function onTopic(items: Headline[], { interest, interests, fromSection }: { interest: string; interests: string[]; fromSection: boolean }): Headline[] {
  // An interest that is itself a team or player ("Chicago Bears") keeps its stories: the
  // headline names the whole interest, not just one of its words (a place like "Austin Texas").
  const named = (h: Headline) => h.title.toLowerCase().includes(interest.toLowerCase().trim());
  return items.filter((h) => (fromSection
    ? !unwantedCategory(h, interests)
    : mentions(h, interest) && (!unwantedCategory(h, interests) || named(h))));
}

/**
 * True when a story is about a topic the user wants to avoid: every word of the avoided topic
 * appears in the headline or summary (so "royal family" does not drop every story with "family").
 */
export function avoided(h: Pick<Headline, 'title' | 'desc'>, avoid: string[]): boolean {
  const text = `${h.title} ${h.desc}`.toLowerCase();
  const kinds = `${h.title} ${h.desc.slice(0, 200)}`;
  return avoid.some((topic) => {
    const kind = AVOID_KINDS.find((k) => k.topic.test(topic.trim().toLowerCase()));
    if (kind) return kind.content.test(kinds);
    const keys = topic.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    return keys.length > 0 && keys.every((w) => text.includes(w.length > 4 ? w.slice(0, -1) : w));
  });
}

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

/** The question put to the AI: which of these numbered headlines are about a topic the listener wants left out. */
export function screenPrompt(headlines: string[], avoid: string[]): { system: string; user: string } {
  return {
    system: 'You screen news headlines for a listener. Answer only with numbers.',
    user: `The listener does NOT want any story about: ${avoid.join(', ')}.\nBe strict. A story counts if it is about the topic in any way, even when the word is never used (for sports: any team, player, coach, game, score, league, transfer or season; for politics: any politician, party, election or government fight).\n\nHeadlines:\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nReply with the numbers of the headlines to LEFT OUT, separated by commas, or NONE.`,
  };
}

/** The zero-based positions the AI said to leave out (ignores anything that is not a valid number). */
export function parseScreenReply(reply: string, count: number): Set<number> {
  const out = new Set<number>();
  if (/^\s*none\b/i.test(reply)) return out;
  for (const m of reply.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (n >= 1 && n <= count) out.add(n - 1);
  }
  return out;
}

/** True when what was found for a story says little more than its headline (empty, short, or a repeat of the title), so the story cannot be explained from it. */
export function isThinDetail(detail: string, title: string): boolean {
  const text = detail.replace(/\s+/g, ' ').trim();
  if (text.length < 140) return true;
  return similarity(text.slice(0, 220), title) >= 0.8;
}

/** The line that goes with a story's material when it is thin: the script says so briefly instead of inventing details. */
export const HEADLINE_ONLY_NOTE = 'Only the headline was available for this story: report the headline in one short sentence and say details were not available. Do not add facts.';

/** Stories about killings, shootings, stabbings, fatal crashes and the like: a few are news, a briefing made of them is a bad start to a day. */
const VIOLENT = /\b(murder\w*|homicide|shooting|shot dead|gunman|stabb\w+|massacre|manslaughter|slain|beheaded|hostage|kidnapp\w+|killed|dead|dies|died|death toll|fatal(ly)?|deadly)\b|\b(crash(es|ed)?|collision|collided|wreck|pile-?up|rollover|overturned|derail\w*)\b.{0,70}\b(kill\w*|dead|die[sd]?|fatal\w*|injur\w+|hospital\w*|victims?)\b|\b(kill\w*|dead|die[sd]?|fatal\w*|injur\w+|victims?)\b.{0,70}\b(crash(es|ed)?|collision|wreck|pile-?up|rollover)\b/i;
/** A listener who asked for crime, crash or safety stories gets them. */
const WANTS_VIOLENT = /\b(crime|crimes|police|accidents?|crash(es)?|traffic|safety|shootings?|true crime|law enforcement|courts?)\b/i;

/** True when a headline is about a killing, a shooting or a deadly crash. Pure. */
export const isViolentStory = (h: Pick<Headline, 'title' | 'desc'>): boolean => VIOLENT.test(`${h.title} ${h.desc.slice(0, 200)}`);
/** True when one of the listener's interests asks for that kind of story. */
export const wantsViolentNews = (interests: string[]): boolean => interests.some((i) => WANTS_VIOLENT.test(i));

/** Fun-fact areas: science and nature first, then the odd corners of everything. Picked at random, so facts are not about whatever country the news is about. */
const FUN_FACT_AREAS = [
  'astronomy', 'black holes', 'chemistry', 'the human body', 'octopuses', 'deep sea animals', 'volcanoes', 'mathematics', 'quantum physics', 'fungi', 'dinosaurs', 'bird migration',
  'glaciers', 'the periodic table', 'bioluminescence', 'plant biology', 'genetics', 'insects', 'the brain', 'electricity', 'sound', 'light', 'crystals', 'ocean currents',
  'comets and asteroids', 'bees', 'whales', 'trees', 'the moon', 'DNA', 'earthquakes', 'sleep', 'the immune system', 'rainbows', 'caves', 'coral reefs', 'spiders', 'magnets',
  'the speed of light', 'prime numbers', 'ancient clocks', 'languages of the world', 'musical instruments', 'bridges', 'the Sun', 'planets', 'viruses', 'bats', 'sharks', 'frogs',
];
/** Topics to look for a fun fact in, best first: two science or nature areas picked at random, then the listener's interests as a fallback. Pure given the random numbers. */
export function funFactTopics(interests: string[], rng: () => number = Math.random): string[] {
  const shuffle = <T,>(list: T[]): T[] => list.map((x) => ({ x, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.x);
  return [...shuffle(FUN_FACT_AREAS).slice(0, 2), ...shuffle(interests.map((t) => t.trim()).filter(Boolean))];
}
const AMERICAN = /\b(united states|u\.s\.a?\b|usa|american|americans|america)\b/i;
/** True when a page is about the United States or something American: fun facts are meant to be from anywhere, so these are passed over. */
export const americaCentric = (title: string, text: string): boolean => AMERICAN.test(`${title} ${text.slice(0, 400)}`);

/** The outlet is named for one story in five, so the briefing does not say where every story came from. Pure. */
export const namesOutlet = (n: number): boolean => n % 5 === 0;
