const mockReply = jest.fn<Promise<string>, [string, string]>();
const mockSearch = jest.fn();
const mockChunks = jest.fn();
const mockPerf = { contextLength: 4096 };

jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));
jest.mock('../../../src/bootstrap/hookRegistry', () => ({ callHook: jest.fn(async () => undefined), HOOKS: { ensureTextModel: 'ensureTextModel', protectedProjectIds: 'protectedProjectIds' } }));
jest.mock('../../../src/services/rag', () => ({ ragService: { searchProject: (...a: unknown[]) => mockSearch(...a) } }));
jest.mock('../../../src/services/rag/knowledgeSource', () => ({ knowledgeSource: () => ({ getChunksByProject: (...a: unknown[]) => mockChunks(...a) }) }));
jest.mock('../../../src/services/llm', () => ({
  llmService: { getPerformanceSettings: () => mockPerf, generateResponse: async (msgs: Array<{ role: string; content: string }>) => mockReply(msgs[0].content, msgs[1].content) },
}));
jest.mock('../../../src/atlasTools/offGridState', () => ({ offGridOn: () => true }));
jest.mock('../../../src/atlasTools/offlineLibrary', () => ({ searchLibrary: async () => [{ uri: 'u', path: 'p', library: 'Wiki' }], readArticle: async () => ({ title: 'Lease', text: 'A lease is a contract for the use of an asset over a fixed period.' }) }));

import * as engine from '../../../src/study/engine';

const chunk = (name: string, position: number, content: string) => ({ name, position, content });
const SOURCES = [
  { n: 1, doc: 'Book', part: 1, text: 'Assets equal liabilities plus equity in a balanced ledger. The lease is a contract.' },
  { n: 2, doc: 'Book', part: 2, text: 'Liabilities are the amounts a business owes. Equity is the owner claim.' },
];
beforeEach(() => {
  mockReply.mockReset(); mockSearch.mockReset(); mockChunks.mockReset(); mockPerf.contextLength = 4096;
  mockSearch.mockResolvedValue({ chunks: [chunk('Book', 0, 'Assets equal liabilities plus equity in a balanced ledger.'), chunk('Book', 1, 'Liabilities are the amounts a business owes.'), chunk('Book', 1, 'Liabilities are the amounts a business owes.')] });
  mockChunks.mockReturnValue([chunk('Book', 2, 'Third passage of the book about leases and contracts.'), chunk('Book', 0, 'First passage about assets and equity.'), chunk('Notes', 0, 'A note about debt.')]);
});

describe('gathering sources', () => {
  it('searches a topic, tops up with an even spread, drops duplicates and respects the budget', async () => {
    const withTopic = await engine.gatherSources('p', 'leases');
    expect(withTopic.map((s) => s.n)).toEqual(withTopic.map((_, i) => i + 1));
    expect(withTopic.length).toBeGreaterThanOrEqual(3); expect(new Set(withTopic.map((s) => s.text)).size).toBe(withTopic.length);
    mockSearch.mockResolvedValue({ chunks: [] });
    const spread = await engine.gatherSources('p', '  ');
    expect(spread.map((s) => s.doc)).toEqual(expect.arrayContaining(['Book', 'Notes']));
    const cache: { all?: unknown[] } = {};
    await engine.gatherSources('p', '', { cache }); await engine.gatherSources('p', '', { cache });
    expect(mockChunks).toHaveBeenCalledTimes(3); // once more for the cached pair
    mockChunks.mockReturnValue([chunk('Big', 0, 'x'.repeat(2000))]);
    expect(await engine.gatherSources('p', '', { share: 0.001 })).toEqual([]);
  });
  it('trims sources to what the model context can hold, and renders a source block', () => {
    mockPerf.contextLength = 2048;
    const long = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, doc: 'd', part: 1, text: 'y'.repeat(700) }));
    const trimmed = engine.trimSources(long);
    expect(trimmed.length).toBeLessThan(20); expect(trimmed.map((s) => s.n)).toEqual(trimmed.map((_, i) => i + 1));
    expect(engine.sourceBlock(SOURCES)).toMatch(/\[1\] \(Book, part 1\)\n/);
  });
});

describe('learning terms', () => {
  it('keeps only terms that really occur in the sources, with sensible clues', () => {
    const raw = [
      'TERM: Assets | CLUE: What a business owns | SRC: 1', '- TERM: Equity | CLUE: The owner claim on what the business has | SRC: [2]', 'TERM: Ledger | CLUE: The book of accounts | SRC: 9',
      'TERM: Lease | CLUE: Contains the lease word itself inside | SRC: 1', 'TERM: about | CLUE: A filler word that should be dropped | SRC: 1', 'TERM: Zebra | CLUE: Not in any source at all here | SRC: 1',
      'TERM: Hi | CLUE: Too short a term for this | SRC: 1', 'TERM: Assets | CLUE: Duplicate of the first term here | SRC: 1', 'nonsense line',
    ].join('\n');
    const terms = engine.parseGroundedLearningTerms(raw, SOURCES);
    expect(terms.map((t) => t.answer)).toEqual(['ASSETS', 'EQUITY', 'LEDGER']);
    expect(terms[2].src).toEqual([1]); // cited source 9 does not exist: found in source 1
    expect(engine.isFillerTerm('about')).toBe(true); expect(engine.isFillerTerm('ledger')).toBe(false);
  });
  it('asks the model for terms and refuses when too few can be verified', async () => {
    mockReply.mockResolvedValueOnce('TERM: Assets | CLUE: What a business owns here | SRC: 1\nTERM: Equity | CLUE: The owner claim on assets | SRC: 2\nTERM: Ledger | CLUE: A book of accounts kept | SRC: 1');
    expect((await engine.termsFromSources(SOURCES, 'accounting', 3)).length).toBe(3);
    mockReply.mockResolvedValue('TERM: Zebra | CLUE: Not in the sources at all | SRC: 1');
    await expect(engine.termsFromSources(SOURCES)).rejects.toThrow(/Not enough verifiable terms/);
  });
});

describe('generate', () => {
  const gen = (kind: Parameters<typeof engine.generate>[1], topic = 'leases') => engine.generate('p', kind, topic);
  it('answers, guides, formulas and outlines come back as text', async () => {
    mockReply.mockResolvedValue('<think>hidden</think>Some text [1].');
    for (const kind of ['answer', 'guide', 'formulas', 'outline'] as const) expect((await gen(kind)).text).toBe('Some text [1].');
    expect((await gen('formulas', '')).title).toBe('Formula sheet'); expect((await gen('formulas', 'tax')).title).toBe('Formula sheet: tax');
  });
  it('flashcards parse the one-line form, the two-line form, and refuse garbage', async () => {
    mockReply.mockResolvedValueOnce('**Q: What is a lease? | A: A contract | SRC: 2**\n1. Q: Assets? | A: What you own | SRC: [1, 2]\nQ: No source | A: Answer here');
    const one = await gen('cards'); expect(one.cards).toEqual([{ q: 'What is a lease?', a: 'A contract', src: [2] }, { q: 'Assets?', a: 'What you own', src: [1, 2] }, { q: 'No source', a: 'Answer here', src: [] }]);
    mockReply.mockResolvedValueOnce('Q: Equity?\nA: The owner claim [2]\n\nQ: Debt?\nA: What is owed | SRC: 1');
    const two = await gen('cards'); expect(two.cards?.map((c) => c.q)).toEqual(['Equity?', 'Debt?']); expect(two.cards?.[0].src).toEqual([2]);
    mockReply.mockResolvedValue('nothing useful');
    await expect(gen('cards')).rejects.toThrow(/flashcards in the expected format/);
  });
  it('quizzes keep only complete questions, shuffle the options and remap the answer', async () => {
    mockReply.mockResolvedValueOnce('Q1: What is a lease?\nA) A contract\nB) A bird\nC) A song\nD) A tax\nANSWER: A\nWHY: It is a contract.\nSRC: 2\n\nQ2: Broken\nA) one\nB) two\nANSWER: B\n\nQ3: Bad letter\nA) a\nB) b\nC) c\nD) d\nANSWER: Z');
    const quiz = await gen('quiz');
    expect(quiz.quiz).toHaveLength(1); expect(quiz.quiz![0].options[quiz.quiz![0].answer]).toBe('A contract'); expect(quiz.quiz![0].why).toMatch(/contract/); expect(quiz.quiz![0].src).toEqual([2]);
    mockReply.mockResolvedValue('nothing'); await expect(gen('quiz')).rejects.toThrow(/quiz in the expected format/);
  });
  it('podcasts and slides parse their scripts and refuse unusable ones', async () => {
    mockReply.mockResolvedValueOnce('A: Welcome to the show.\nB: Today we talk about leases.\nA: What is a lease?\nB: A contract [1] to use an asset.\n**A:** Great.');
    expect((await gen('podcast')).podcast?.length).toBe(5);
    mockReply.mockResolvedValue('just prose'); await expect(gen('podcast')).rejects.toThrow(/expected format/);
    mockReply.mockResolvedValueOnce('TITLE: Leases\n- A contract\n- A fixed period\nSAY: A lease is a contract [1].\nSRC: 1, 2\n\nSlide 2: TITLE: Assets\n- Things owned\nSRC: [2]');
    const slides = await gen('slides'); expect(slides.slides?.map((s) => s.title)).toEqual(['Leases', 'Assets']); expect(slides.slides?.[0].narration).toBe('A lease is a contract .');
    mockReply.mockResolvedValue('no titles'); await expect(gen('slides')).rejects.toThrow(/slides in the expected format/);
  });
  it('puzzle kinds need verifiable terms and crossings', async () => {
    const terms = 'TERM: Assets | CLUE: What a business owns here | SRC: 1\nTERM: Equity | CLUE: The owner claim on assets | SRC: 2\nTERM: Ledger | CLUE: A book of accounts kept | SRC: 1\nTERM: Liabilities | CLUE: What the business owes | SRC: 2';
    for (const kind of ['crossword', 'wordsearch', 'match'] as const) {
      mockReply.mockResolvedValueOnce(terms);
      const r = await gen(kind).catch((e: Error) => e);
      expect(r instanceof Error ? r.message : r.kind).toMatch(/crossword|wordsearch|word search|match|enough|Project/i);
    }
  });
  it('refuses when learning activities are off, or the project has no documents', async () => {
    const { useProjectStore } = require('../../../src/stores/projectStore');
    const project = useProjectStore.getState().createProject({ name: 'Off', description: '', systemPrompt: '', icon: '#000' });
    useProjectStore.getState().updateProject?.(project.id, { allowLearningActivities: false });
    await expect(engine.generate(project.id, 'quiz', '')).rejects.toThrow(/Enable Learning Activities/);
    expect(engine.learningActivitiesEnabled('does-not-exist')).toBe(true);
    mockSearch.mockResolvedValue({ chunks: [] }); mockChunks.mockReturnValue([]);
    await expect(gen('guide')).rejects.toThrow(/no documents/);
  });
});

describe('podcast episodes', () => {
  const NOUNS = ['bridges', 'rainfall', 'trains', 'markets', 'schools', 'music', 'farms', 'rivers', 'airports', 'libraries'];
  const lineReply = (n: number, seed = 'Topic') => Array.from({ length: n }, (_, i) => `${i % 2 ? 'B' : 'A'}: ${seed} reports ${NOUNS[(i * 3 + seed.length) % 10]} and ${NOUNS[(i * 7 + 1) % 10]} number ${i}.`).join('\n');
  it('warns about a small context and counts parts', () => {
    expect(engine.podcastContextWarning()).toBeNull(); mockPerf.contextLength = 2048; expect(engine.podcastContextWarning()).toMatch(/Raise it to at least 4096/);
    expect([engine.podcastParts(1), engine.podcastParts(6), engine.podcastParts(500)]).toEqual([1, 4, 60]);
  });
  it('merges new episode sources without repeating passages', () => {
    const merged = engine.mergeEpisodeSources([SOURCES[0]], [SOURCES[0], { n: 1, doc: 'New', part: 1, text: 'brand new text' }]);
    expect(merged.all).toHaveLength(2); expect(merged.part.map((p) => p.n)).toEqual([1, 2]);
  });
  it('drops repeated lines and sizes parts from their sources', () => {
    const before = [{ host: 'A' as const, text: 'The lease is a contract to use an asset for a fixed period' }];
    const fresh = [{ host: 'B' as const, text: 'The lease is a contract to use an asset for a fixed period of time' }, { host: 'A' as const, text: 'Equity means the owner claim on assets' }, { host: 'A' as const, text: 'Equity means the owner claim on assets' }];
    expect(engine.withoutRepeats(fresh, before).map((l) => l.text)).toEqual(['Equity means the owner claim on assets']);
    expect(engine.outlineLines([{ n: 1, doc: 'd', part: 1, text: 'x'.repeat(100) }])).toBe(3); expect(engine.outlineLines([{ n: 1, doc: 'd', part: 1, text: 'x'.repeat(5000) }])).toBe(8);
  });
  it('plans and writes a short episode, then a long one with a fallback plan', async () => {
    mockReply.mockImplementation(async (_sys, user) => (/Reply exactly/.test(user) ? 'TITLE: **Leases explained**\nSEGMENT 1: Basics\nSEGMENT 2: Details' : lineReply(5)));
    const steps: string[] = [];
    const ep = await engine.generatePodcast('p', { prompt: 'leases', style: 'casual', research: false, minutes: 3 }, (m) => steps.push(m));
    expect(ep.title).toBe('Leases explained'); expect(ep.podcast!.length).toBeGreaterThanOrEqual(8); expect(steps.some((s) => /Writing part 2 of 2/.test(s))).toBe(true);
    mockReply.mockImplementation(async (_sys, user) => (/Reply exactly/.test(user) ? 'no format at all' : lineReply(5)));
    const long = await engine.generatePodcast('p', { prompt: '', style: 'deep', research: false, minutes: 18, hosts: 3, funFacts: true }, () => undefined);
    expect(long.podcast!.length).toBeGreaterThan(20); expect(long.title).toBe('Episode');
  });
  it('can stop early with a proper ending, research first, and refuse unusable scripts', async () => {
    let calls = 0;
    mockReply.mockImplementation(async (_sys, user) => (/Reply exactly/.test(user) ? 'TITLE: T\nSEGMENT 1: a\nSEGMENT 2: b\nSEGMENT 3: c' : (calls++, lineReply(5, `Call${calls}`))));
    const stopped = await engine.generatePodcast('p', { prompt: 'x', style: 'debate', research: true, minutes: 5, hosts: 1, shouldStop: () => calls >= 1 }, () => undefined);
    expect(stopped.podcast!.length).toBeGreaterThanOrEqual(5); expect(stopped.sources.some((s) => s.origin === 'library')).toBe(true);
    mockReply.mockImplementation(async (_sys, user) => (/Reply exactly/.test(user) ? 'TITLE: T\nSEGMENT 1: a' : 'no lines here'));
    await expect(engine.generatePodcast('p', { prompt: 'x', style: 'casual', research: false, minutes: 2 })).rejects.toThrow(/expected format/);
  });
  it('writes an outlined episode (a news briefing) with transitions and a word target', async () => {
    mockReply.mockImplementation(async (_s, user) => lineReply(4, user.includes('Story two') ? 'Second' : 'First'));
    const used: number[] = [];
    const src = (text: string) => [{ n: 1, doc: 'Feed', part: 1, text }];
    const ep = await engine.writeEpisode([], {
      prompt: 'News', style: 'news', research: false, title: 'Morning news', linesPerItem: 5, targetWords: 60, hosts: 2, noWelcome: true, rules: 'No sport',
      castFor: (i) => (i ? 'A and B' : undefined), onItemsUsed: (n) => used.push(n),
      outline: [{ topic: 'Story one', sources: src('First story text about a bridge opening in town today with many details.') }, { topic: 'Story two', sources: src('Second story text about rain.') }, { topic: 'Fun fact', always: true, sources: src('A fun fact about bridges.') }],
    });
    expect(ep.title).toBe('Morning news'); expect(ep.storyStarts?.length).toBeGreaterThan(0); expect(used[0]).toBeGreaterThanOrEqual(1);
    mockReply.mockResolvedValue('nothing');
    await expect(engine.writeEpisode([], { prompt: 'x', style: 'news', research: false, outline: [{ topic: 't', sources: src('text') }] })).rejects.toThrow(/expected format/);
  });
});
