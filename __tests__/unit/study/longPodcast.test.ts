/** An hour-long episode is planned in batches and written part by part, each part reading its own passages. */
const calls: { system: string; user: string }[] = [];

jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: async () => undefined }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    getPerformanceSettings: () => ({ contextLength: 4096 }),
    // A stand-in model: plans as asked and writes ten lines per part.
    generateResponse: async (msgs: { role: string; content: string }[]) => {
      const system = msgs[0].content; const user = msgs[1].content;
      calls.push({ system, user });
      if (/plan podcast/i.test(system)) {
        const wanted = [...user.matchAll(/SEGMENT (\d+):/g)].map((m) => Number(m[1]));
        return `${/TITLE:/.test(user) ? 'TITLE: The Long Show\n' : ''}${wanted.map((n) => `SEGMENT ${n}: topic number ${n}`).join('\n')}`;
      }
      return Array.from({ length: 5 }, (_, i) => `A: question ${i}?\nB: answer ${i}.`).join('\n');
    },
  },
}));

import { writeEpisode, podcastParts, mergeEpisodeSources, MAX_PODCAST_MINUTES, type Source } from '../../../src/study/engine';

const src = (n: number, text = `passage ${n}`): Source => ({ n, doc: 'doc.txt', part: n, text });

describe('hour-long podcast', () => {
  beforeEach(() => { calls.length = 0; });

  it('counts about 1.5 minutes per part and caps at 90 minutes', () => {
    expect(podcastParts(60)).toBe(40);
    expect(podcastParts(5)).toBe(3);
    expect(podcastParts(500)).toBe(MAX_PODCAST_MINUTES / 1.5);
  });

  it('plans 40 parts in batches of 12 and writes every one, each with its own passages', async () => {
    const fetched: string[] = [];
    const result = await writeEpisode([src(1)], {
      prompt: 'the whole course', minutes: 60, style: 'casual', research: false,
      sourcesFor: async (topic) => { fetched.push(topic); return [src(1, `passage for ${topic}`)]; },
    });
    const planCalls = calls.filter((c) => /plan podcast/i.test(c.system));
    expect(planCalls).toHaveLength(4); // 12 + 12 + 12 + 4
    expect(planCalls[1].user).toContain('Parts planned so far');
    expect(planCalls[3].user).toContain('wrap-up');
    expect(result.title).toBe('The Long Show');
    expect(fetched).toHaveLength(40);
    expect(result.podcast!.length).toBe(40 * 10);
    // Every part sees the outline and the passages found for its own topic.
    const writeCalls = calls.filter((c) => /write natural podcast/i.test(c.system));
    expect(writeCalls).toHaveLength(40);
    expect(writeCalls[20].user).toContain('Episode outline');
    expect(writeCalls[20].user).toContain('passage for topic number 21');
    // The saved episode lists all the passages it drew on.
    expect(result.sources.length).toBeGreaterThan(30);
  });

  it('keeps what is written when stopped', async () => {
    let parts = 0;
    const result = await writeEpisode([src(1)], {
      prompt: 'x', minutes: 60, style: 'casual', research: false,
      shouldStop: () => parts >= 5,
      sourcesFor: async () => { parts++; return [src(1)]; },
    });
    expect(result.podcast!.length).toBeGreaterThanOrEqual(40);
    expect(result.podcast!.length).toBeLessThan(40 * 10);
    // A closing part was asked for, so the episode does not stop mid-topic.
    expect(calls[calls.length - 1].user).toContain('The episode ends here');
  });

  it('a stop pressed while planning still gives a full plan and an ended episode', async () => {
    let stop = false;
    const result = await writeEpisode([src(1)], {
      prompt: 'x', minutes: 60, style: 'casual', research: false,
      shouldStop: () => stop,
      sourcesFor: async () => { stop = true; return [src(1)]; },
    });
    expect(calls.filter((c) => /plan podcast/i.test(c.system))).toHaveLength(4);
    expect(result.podcast!.length).toBeGreaterThan(0);
  });

  it('reuses a passage that was already used instead of numbering it twice', () => {
    const a = mergeEpisodeSources([src(1, 'same')], [src(1, 'same'), src(2, 'new')]);
    expect(a.all.map((s) => s.n)).toEqual([1, 2]);
    expect(a.part.map((s) => s.text)).toEqual(['same', 'new']);
  });
});
