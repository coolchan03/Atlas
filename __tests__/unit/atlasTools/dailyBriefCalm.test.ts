/**
 * A calmer, less repetitive briefing: killings and deadly crashes are limited to a story or two, the outlet is named for one story in
 * five, a 15 minute show is planned from more stories than a 10 minute one, and the fun fact is about science, not the news's country.
 */
jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: jest.fn(async () => undefined) }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (job: () => Promise<any>) => job() }));
const mockPrompts: string[] = [];
jest.mock('../../../src/services/llm', () => ({
  llmService: { generateResponse: jest.fn(async (msgs: any[]) => { mockPrompts.push(msgs[1].content); return 'A: Here is the story.\nB: Thanks.'; }) },
}));
jest.mock('../../../src/services/tools/handlers', () => ({ readPage: jest.fn(async () => '') }));
const mockLibrary = { asked: [] as string[] };
jest.mock('../../../src/atlasTools/offlineLibrary', () => ({
  searchLibrary: jest.fn(async (topic: string) => { mockLibrary.asked.push(topic); return [{ uri: 'u', path: 'p', library: 'Wikipedia' }]; }),
  readArticle: jest.fn(async () => ({ title: 'Octopus', text: 'An octopus has three hearts and blue blood.' })),
}));
jest.mock('../../../src/atlasTools/offGrid', () => ({ offGridOn: () => false }));

import { makeBriefing, useBriefPrefs } from '../../../src/atlasTools/dailyBrief';
import { isViolentStory } from '../../../src/atlasTools/newsSources';

const item = (title: string, source: string) =>
  `<item><title>${title}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(title)}</link><pubDate>${new Date(Date.now() - 3600e3).toUTCString()}</pubDate><description>${title}</description><source url="https://x">${source}</source></item>`;
const CALM = ['Council approves new library budget', 'Researchers map a rare coral nursery', 'Airline adds routes to the islands', 'Farmers report a strong barley harvest', 'Museum reopens its restored east wing', 'Telescope team finds a planet with two suns', 'Schools trial a four day week', 'Bakery wins an award for rye bread', 'Town plants ten thousand trees'];
const VIOLENT = ['Man killed in head-on crash on Highway 9', 'Three dead after truck collides with bus', 'Gunman opens fire at mall, police say', 'Fatal pile-up closes the interstate', 'Woman stabbed outside a station'];
const OUTLETS = ['Reuters', 'BBC', 'AP', 'Guardian', 'NPR', 'CNN', 'Sky', 'CBS', 'Al Jazeera', 'DW', 'France24', 'Bloomberg', 'Times', 'Mail'];

beforeEach(() => {
  mockPrompts.length = 0; mockLibrary.asked = [];
  const stories = [...VIOLENT.slice(0, 3), ...CALM.slice(0, 4), ...VIOLENT.slice(3), ...CALM.slice(4)];
  (global as any).fetch = jest.fn(async (url: string) => {
    const section = url.match(/topic\/([A-Z]+)/)?.[1];
    const body = section === 'NATION' ? `<rss>${stories.map((t, i) => item(t, OUTLETS[i % OUTLETS.length])).join('')}</rss>` : '<rss></rss>';
    return { ok: true, status: 200, text: async () => body };
  });
  useBriefPrefs.setState({ interests: ['United States'], minutes: 10, hosts: 2, funFacts: true, deep: false, avoid: [], experts: false });
});

it('lets at most one violent story through and says the outlet for about one story in five', async () => {
  const r = await makeBriefing(() => undefined, 2);
  const titles = (r.headlines ?? []).map((h) => h.title);
  expect(titles.length).toBeGreaterThanOrEqual(8);
  expect(titles.filter((t) => isViolentStory({ title: t, desc: t })).length).toBeLessThanOrEqual(1);
  // The model is told an outlet only for the 5th and 10th story.
  const withOutlet = mockPrompts.filter((p) => OUTLETS.some((o) => new RegExp(`\\(${o}, part 1\\)`).test(p)) || /Outlet:/.test(p));
  expect(withOutlet.length).toBeLessThanOrEqual(2);
  expect(withOutlet.length).toBeGreaterThanOrEqual(1);
  expect(mockPrompts[0]).not.toMatch(/Outlet:/);
});

it('gives crime and crash stories to a listener who asked for them', async () => {
  useBriefPrefs.setState({ interests: ['United States', 'crime'] });
  const r = await makeBriefing(() => undefined, 2);
  expect((r.headlines ?? []).filter((h) => isViolentStory({ title: h.title, desc: h.title })).length).toBeGreaterThan(1);
});

it('looks for the fun fact in science and nature, not in the interests of the news', async () => {
  await makeBriefing(() => undefined, 2);
  expect(mockLibrary.asked.length).toBeGreaterThan(0);
  expect(mockLibrary.asked).not.toContain('United States');
});

it('plans three stories a minute: 30 for 10 minutes, 45 for 15 and 60 for 20', async () => {
  const { storyBudget } = require('../../../src/atlasTools/newsSources');
  expect(storyBudget(15, true)).toBe(45);
  expect(storyBudget(15, true)).toBeGreaterThan(storyBudget(10, true));
  expect(storyBudget(20, true)).toBe(60);
});
