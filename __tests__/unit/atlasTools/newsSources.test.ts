import { sectionFor, feedsFor, isPromotional, splitOutlet, cleanHeadlines, pickStories, storyBudget, similarity } from '../../../src/atlasTools/newsSources';
import { parseRss } from '../../../src/atlasTools/dailyBrief';

const NOW = Date.parse('2026-10-19T15:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600e3).toUTCString();

// Google News section feed shape: "Title - Outlet" plus a <source> tag.
const GOOGLE = `<rss><channel>
<item><title>Senate passes funding bill to avert shutdown - Reuters</title><link>https://news.google.com/rss/articles/abc</link><pubDate>${hoursAgo(3)}</pubDate><description>&lt;a href="x"&gt;Senate passes funding bill&lt;/a&gt;</description><source url="https://www.reuters.com">Reuters</source></item>
<item><title>Senate approves stopgap funding bill, averting shutdown - AP News</title><link>https://news.google.com/rss/articles/def</link><pubDate>${hoursAgo(2)}</pubDate><description>dup</description><source url="https://apnews.com">AP News</source></item>
<item><title>Old story from last week - CNN</title><link>https://news.google.com/rss/articles/old</link><pubDate>${hoursAgo(24 * 6)}</pubDate><description>old</description><source url="https://cnn.com">CNN</source></item>
</channel></rss>`;

// Bing News search shape: outlet in <News:Source>, links are redirects carrying the real URL.
const BING = `<rss xmlns:News="https://www.bing.com/news/search?q=United+States&amp;format=rss"><channel>
<item><title>EDvance Software Announces AI Platform for United States Schools</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fwww.globenewswire.com%2fnews-release%2f2026%2f10%2f19%2fedvance</link><description>EDvance today announced...</description><pubDate>${hoursAgo(1)}</pubDate><News:Source>GlobeNewswire</News:Source></item>
<item><title>Sponsored: Best credit cards to buy this fall</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fexample.com</link><description>Partner content</description><pubDate>${hoursAgo(1)}</pubDate><News:Source>Example Deals</News:Source></item>
<item><title>Supreme Court hears arguments on tariff case</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fwww.npr.org%2f2026%2f10%2f19%2ftariffs</link><description>The justices weighed...</description><pubDate>${hoursAgo(4)}</pubDate><News:Source>NPR</News:Source></item>
</channel></rss>`;

describe('daily briefing news sources', () => {
  it('uses top-story sections for broad interests and search for specific ones', () => {
    expect(sectionFor('United States')).toBe('NATION');
    expect(sectionFor('U.S. news')).toBe('NATION');
    expect(sectionFor('international news')).toBe('WORLD');
    expect(sectionFor('world')).toBe('WORLD');
    expect(sectionFor('tech')).toBe('TECHNOLOGY');
    expect(sectionFor('news')).toBe('NATION');
    expect(sectionFor('the Chicago Bears')).toBeNull();
    expect(feedsFor('United States')[0]).toContain('/headlines/section/topic/NATION');
    expect(feedsFor('Chicago Bears')[0]).toContain('/rss/search?q=Chicago%20Bears');
  });

  it('reads the outlet from both Google <source> and Bing <News:Source>', () => {
    expect(parseRss(GOOGLE)[0].source).toBe('Reuters');
    expect(parseRss(BING)[2].source).toBe('NPR');
  });

  it('drops press releases and sponsored/shopping items (the "EDvance software" problem)', () => {
    const items = parseRss(BING);
    expect(isPromotional(items[0])).toBe(true); // GlobeNewswire press release
    expect(isPromotional(items[1])).toBe(true); // sponsored deals
    expect(isPromotional(items[2])).toBe(false);
    expect(cleanHeadlines(items, NOW).map(h => h.title)).toEqual(['Supreme Court hears arguments on tariff case']);
  });

  it('moves the outlet out of Google titles, merges the same story from two outlets, drops old news', () => {
    expect(splitOutlet({ title: 'A big story - The Guardian', desc: '' })).toMatchObject({ title: 'A big story', source: 'The Guardian' });
    const clean = cleanHeadlines(parseRss(GOOGLE), NOW);
    expect(clean).toHaveLength(1);
    expect(clean[0].source).toBe('Reuters');
    expect(similarity('Senate passes funding bill to avert shutdown', 'Senate approves stopgap funding bill, averting shutdown')).toBeGreaterThanOrEqual(0.6);
  });

  it('does not repeat a story another interest already covers', () => {
    const seen = ['Senate passes funding bill to avert shutdown'];
    expect(cleanHeadlines(parseRss(GOOGLE), NOW, seen)).toHaveLength(0);
  });

  it('covers every interest before adding a second story to any of them', () => {
    const h = (t: string) => ({ title: t, desc: '' });
    const picked = pickStories([[h('us1'), h('us2'), h('us3')], [h('w1')], [h('b1'), h('b2')]], 5);
    expect(picked.map(p => p.headline.title)).toEqual(['us1', 'w1', 'b1', 'us2', 'b2']);
    expect(storyBudget(1)).toBe(3);
    expect(storyBudget(5)).toBe(5);
    expect(storyBudget(30)).toBe(10);
  });
});
