/**
 * The briefing is written only from real, current stories: one part per headline, ads and
 * press releases never reach the model, and fun facts come only from the offline library.
 */
jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: jest.fn(async () => undefined) }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (job: () => Promise<any>) => job() }));
const mockPrompts: string[] = [];
jest.mock('../../../src/services/llm', () => ({
  llmService: { generateResponse: jest.fn(async (msgs: any[]) => { mockPrompts.push(msgs[1].content); return 'A: Here is the story.\nB: Thanks.'; }) },
}));
jest.mock('../../../src/services/tools/handlers', () => ({ readPage: jest.fn(async () => 'x'.repeat(500)) }));
jest.mock('../../../src/atlasTools/offlineLibrary', () => ({
  searchLibrary: jest.fn(async () => [{ uri: 'u', path: 'p', library: 'Wikipedia' }]),
  readArticle: jest.fn(async () => ({ title: 'Octopus', text: 'An octopus has three hearts and blue blood.' })),
}));
const mockOffGrid = { on: false };
jest.mock('../../../src/atlasTools/offGrid', () => ({ offGridOn: () => mockOffGrid.on }));
const mockCal: { ctx: unknown } = { ctx: null };
jest.mock('../../../src/atlasTools/calendarBrief', () => ({ readCalendarContext: async () => mockCal.ctx, calendarSummary: () => 'You have a flight today.', fetchFlightStatus: async (f: string) => (f === 'UA1' ? 'On time' : null) }));
jest.mock('../../../src/atlasTools/weather', () => ({ fetchWeather: async () => ({ ok: true }), weatherSummary: () => 'Sunny and 20 degrees.' }));

import { makeBriefing, useBriefPrefs, expertCast, parseInterests, parseRss, greetingLine, latestHeadlines, aiScreen, todayKey, todaysBrief, briefings } from '../../../src/atlasTools/dailyBrief';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600e3).toUTCString();
const item = (title: string, source: string, h = 2, link = 'https://news.google.com/rss/articles/x') =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${hoursAgo(h)}</pubDate><description>${title}</description><source url="https://x">${source}</source></item>`;
const FEEDS: Record<string, string> = {
  NATION: `<rss>${item('Senate passes funding bill - Reuters', 'Reuters')}${item('Acme Corp Announces Sponsored webinar - PR Newswire', 'PR Newswire')}</rss>`,
  WORLD: `<rss>${item('Ceasefire talks resume in Geneva - BBC', 'BBC')}</rss>`,
};

beforeEach(() => {
  mockPrompts.length = 0;
  (global as any).fetch = jest.fn(async (url: string) => {
    const section = url.match(/topic\/([A-Z]+)/)?.[1];
    const body = section ? FEEDS[section] ?? '<rss></rss>' : '<rss></rss>'; // Bing detail lookups: nothing extra
    return { ok: true, status: 200, text: async () => body };
  });
  useBriefPrefs.setState({ interests: ['United States', 'international news'], minutes: 3, hosts: 2, funFacts: true, deep: false, avoid: [], experts: false });
});


beforeEach(() => { mockOffGrid.on = false; mockCal.ctx = null; });

it('reads the article itself and the flight, weather and calendar when they are there', async () => {
  const { useMaps } = require('../../../src/atlasMaps/maps');
  useMaps.setState({ lastFix: { lat: 1, lon: 2 } });
  mockCal.ctx = { flights: [{ raw: 'UA1', airline: 'United' }, { raw: 'ZZ9', airline: 'Zed' }] };
  useBriefPrefs.setState({ deep: true });
  const steps: string[] = [];
  const r = await makeBriefing((m) => steps.push(m), 2);
  expect(steps.some((s) => /Checking flight UA1/.test(s))).toBe(true);
  expect(r.headlines?.length).toBeGreaterThan(0);
  expect(todaysBrief()).toBeTruthy();
  expect(briefings().length).toBeGreaterThan(0);
});

it('says why nothing could be made, off-grid or online', async () => {
  (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
  const lib = require('../../../src/atlasTools/offlineLibrary');
  lib.searchLibrary.mockResolvedValue([]);
  await expect(makeBriefing(() => undefined, 2)).rejects.toThrow('Could not reach the news');
  mockOffGrid.on = true;
  await expect(makeBriefing(() => undefined, 2)).rejects.toThrow('Off-grid mode');
  lib.searchLibrary.mockResolvedValue([{ uri: 'u', path: 'p', library: 'Wikipedia' }]);
});

it('uses a single voice with fun facts off', async () => {
  useBriefPrefs.setState({ funFacts: false });
  const r = await makeBriefing(() => undefined, 1);
  expect(r.hosts).toBeDefined();
  expect(mockPrompts.length).toBeGreaterThan(0);
});

describe('helpers', () => {
  it('casts experts on alternating voices and parses interests', () => {
    expect(expertCast('space', 0)).toMatch(/B \(/);
    expect(expertCast('space', 1)).toMatch(/C \(/);
    expect(parseInterests('I really like space, the Bears and cooking.')).toEqual(['space', 'the Bears', 'cooking']);
    expect(parseInterests('Interests: a')).toEqual([]);
    expect(parseInterests('Cooking, cooking; also Chess')).toEqual(['Cooking', 'Chess']);
  });
  it('parses RSS with entities, CDATA and bad dates', () => {
    const xml = '<rss><item><title><![CDATA[A &amp; B &#65; &quot;q&quot;]]></title><link>http://x</link><pubDate>bad</pubDate><description>d &lt;b&gt;</description><News:Source>Src</News:Source></item><item><description>no title</description></item></rss>';
    const out = parseRss(xml);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('A & B A "q"');
    expect(out[0].source).toBe('Src');
  });
  it('greets by time of day and keys by day', () => {
    expect(greetingLine(new Date(2026, 0, 5, 8))).toMatch(/Good morning/);
    expect(greetingLine(new Date(2026, 0, 5, 14))).toMatch(/Good afternoon/);
    expect(greetingLine(new Date(2026, 0, 5, 21))).toMatch(/Good evening/);
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-1-5');
  });
  it('fetches headlines for a topic and survives a failing feed', async () => {
    expect((await latestHeadlines('world', 2)).length).toBeGreaterThan(0);
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => '' }));
    expect(await latestHeadlines('world', 2)).toEqual([]);
  });
  it('asks the model which headlines to drop, in batches, and survives a failure', async () => {
    expect((await aiScreen([], ['x'])).size).toBe(0);
    expect((await aiScreen(['a'], [])).size).toBe(0);
    const titles = Array.from({ length: 30 }, (_, i) => `Headline ${i}`);
    const dropped = await aiScreen(titles, ['sports']);
    expect(dropped instanceof Set).toBe(true);
    const llm = require('../../../src/services/llm').llmService;
    llm.generateResponse.mockRejectedValueOnce(new Error('boom'));
    expect((await aiScreen(['a'], ['b'])).size).toBe(0);
  });
});
