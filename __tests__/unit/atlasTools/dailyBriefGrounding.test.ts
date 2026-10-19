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
jest.mock('../../../src/services/tools/handlers', () => ({ readPage: jest.fn(async () => '') }));
jest.mock('../../../src/atlasTools/offlineLibrary', () => ({
  searchLibrary: jest.fn(async () => [{ uri: 'u', path: 'p', library: 'Wikipedia' }]),
  readArticle: jest.fn(async () => ({ title: 'Octopus', text: 'An octopus has three hearts and blue blood.' })),
}));
jest.mock('../../../src/atlasTools/offGrid', () => ({ offGridOn: () => false }));

import { makeBriefing, useBriefPrefs } from '../../../src/atlasTools/dailyBrief';

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
  useBriefPrefs.setState({ interests: ['United States', 'international news'], minutes: 3, hosts: 2, funFacts: true, deep: false });
});

it('writes one part per real story, keeps the headlines, and never shows the model an ad', async () => {
  const r = await makeBriefing(() => undefined, 2);
  expect(r.headlines?.map(h => h.title)).toEqual(['Senate passes funding bill', 'Ceasefire talks resume in Geneva']);
  expect(r.headlines?.map(h => h.source)).toEqual(['Reuters', 'BBC']);
  const all = mockPrompts.join('\n');
  expect(all).not.toMatch(/Acme|webinar|PR Newswire/);
  // Two news parts plus one library fun fact; each part sees only its own story.
  expect(mockPrompts).toHaveLength(3);
  expect(mockPrompts[0]).toContain('Senate passes funding bill');
  expect(mockPrompts[0]).not.toContain('Ceasefire');
  expect(mockPrompts[2]).toContain('three hearts');
  expect(mockPrompts[0]).toMatch(/at most \d+ lines/);
});

it('makes an offline edition from the library when there is no news', async () => {
  (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
  const r = await makeBriefing(() => undefined, 1);
  expect(r.title).toMatch(/^Offline edition/);
  expect(r.headlines).toEqual([]);
  expect(mockPrompts.join('\n')).toContain('three hearts');
});
