const mockAsk = jest.fn();
const mockSaved: Record<string, any[]> = {};
const mockSeed = jest.fn(() => true);

jest.mock('../../../src/study/engine', () => ({
  askModel: (...a: unknown[]) => mockAsk(...a),
  gatherSources: jest.fn(async () => [{ n: 1, doc: 'Book', text: 'Assets equal liabilities plus equity. The cash flow statement lists operating activities.' }, { n: 2, doc: 'Book', text: 'A lease is a contract for an asset.' }]),
  termsFromSources: jest.fn(async () => [
    { answer: 'Assets', clue: 'What the business owns', src: [1] }, { answer: 'Equity', clue: 'Owner claim on assets', src: [1] },
    { answer: 'Lease', clue: 'Contract to use an asset', src: [2] }, { answer: 'Liabilities', clue: 'What the business owes', src: [1] },
  ]),
  GROUND: 'Use only the sources.',
  sourceBlock: () => 'SOURCE TEXT',
  useStudyStore: { getState: () => ({ saved: mockSaved }) },
}));
jest.mock('../../../src/study/progress', () => ({ useStudyProgress: { getState: () => ({ seed: mockSeed }) } }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));

import { explainAtLevel, generateGame, gradeExplanation, makeMnemonics, mcQuestions, PROJECT_GAMES, seedReviewItems, statements } from '../../../src/study/games/generate';

const json = (v: unknown) => JSON.stringify(v);
const mc = (n: number) => json({ questions: Array.from({ length: n }, (_, i) => ({ q: `Question ${i}?`, options: ['right', 'wrong a', 'wrong b', 'wrong c'], answer: 0, why: 'because', src: [1], difficulty: (i % 3) + 1, line: i })) });
const tf = json({ statements: Array.from({ length: 6 }, (_, i) => ({ text: `Statement number ${i} is here`, true: i % 2 === 0, fix: 'the fix', src: [1] })) });

beforeEach(() => { mockAsk.mockReset(); mockSeed.mockClear(); for (const k of Object.keys(mockSaved)) delete mockSaved[k]; });

describe('project games: model output is checked before a game is made', () => {
  it('lists every game with whether it needs the model', () => {
    expect(PROJECT_GAMES.length).toBeGreaterThan(15);
    expect(PROJECT_GAMES.filter((g) => g.usesModel === 'live').map((g) => g.type)).toEqual(['feynman', 'tutor', 'levels', 'mnemonic']);
  });
  it('multiple choice: shuffles and remaps the answer, drops bad questions, and refuses too few', async () => {
    mockAsk.mockResolvedValueOnce(json({ questions: [
      { q: 'Good?', options: ['a', 'b', 'c', 'd'], answer: 0, why: 'y', src: [1, 9], difficulty: 7, line: 3 },
      { q: '', options: ['a', 'b', 'c'], answer: 0 }, { q: 'Few options', options: ['a', 'b'], answer: 0 }, { q: 'Bad index', options: ['a', 'b', 'c'], answer: 5 },
      { q: 'Second good?', options: ['x', 'y', 'z'], answer: 2 }, { q: 'Third good?', options: ['x', 'y', 'z'], answer: 1, difficulty: 'hard' },
    ] }));
    const out = await mcQuestions([{ n: 1 } as never, { n: 2 } as never], { count: 3, topic: 'Leases' });
    expect(out).toHaveLength(3);
    expect(out[0].options[out[0].answer]).toBe('a');
    expect(out[0].difficulty).toBe(3); expect(out[0].src).toEqual([1]); expect(out[0].line).toBe(3);
    expect(out[2].difficulty).toBe(2);
    mockAsk.mockResolvedValue(json({ questions: [{ q: 'Only one?', options: ['a', 'b', 'c'], answer: 0 }] }));
    await expect(mcQuestions([{ n: 1 } as never], { count: 5, topic: '' })).rejects.toThrow(/enough usable questions/);
    mockAsk.mockResolvedValue(json([{ q: 'Array form?', options: ['a', 'b', 'c'], answer: 0 }, { q: 'Two?', options: ['a', 'b', 'c'], answer: 1 }, { q: 'Three?', options: ['a', 'b', 'c'], answer: 2 }]));
    expect(await mcQuestions([{ n: 1 } as never], { count: 3, topic: '' })).toHaveLength(3);
  });
  it('asks again once when the first reply is not JSON, then gives up with a clear message', async () => {
    mockAsk.mockResolvedValueOnce('sorry, here you go: not json').mockResolvedValueOnce(tf);
    expect(await statements([{ n: 1 } as never], 6, '')).toHaveLength(6);
    expect(mockAsk).toHaveBeenCalledTimes(2);
    mockAsk.mockReset(); mockAsk.mockResolvedValue('still not json');
    await expect(statements([{ n: 1 } as never], 6, 'x')).rejects.toThrow(/expected format/);
  });
  it('true/false needs at least four real statements and reads true as a word or a flag', async () => {
    mockAsk.mockResolvedValueOnce(json({ statements: [{ text: 'short' }, { text: 'Long enough statement one', true: 'true' }, { text: 'Long enough statement two', isTrue: true }, { text: 'Long enough statement three' }, { text: 'Long enough statement four', true: false }] }));
    const out = await statements([{ n: 1 } as never], 4, '');
    expect(out.map((s) => s.isTrue)).toEqual([true, true, false, false]);
    mockAsk.mockResolvedValue(json({ statements: [{ text: 'Long enough statement one' }] }));
    await expect(statements([{ n: 1 } as never], 4, '')).rejects.toThrow(/enough statements/);
  });
});

describe('generateGame', () => {
  it('review and daily seed spaced repetition from saved material, without the model', async () => {
    mockSaved.p = [
      { kind: 'cards', cards: [{ q: 'Q1', a: 'A1', src: [1] }], learningTerms: [{ clue: 'C', answer: 'T', src: [1] }] },
      { kind: 'game', game: { data: { terms: [{ clue: 'C2', answer: 'T2', src: [2] }] } } },
    ];
    expect(seedReviewItems('p')).toBe(3);
    expect((await generateGame('p', 'review', { topic: '' })).game?.type).toBe('review');
    expect((await generateGame('p', 'daily', { topic: ' x ' })).game?.data.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockAsk).not.toHaveBeenCalled();
    expect(seedReviewItems('empty')).toBe(0);
  });
  it('term games: pairs, hangman, scramble, feynman, palace and cloze', async () => {
    expect((await generateGame('p', 'pairs', { topic: '' })).game?.data.cards.length).toBeGreaterThan(0);
    expect((await generateGame('p', 'hangman', { topic: '' })).game?.data.terms).toHaveLength(4);
    expect((await generateGame('p', 'scramble', { topic: '' })).game?.data.terms.length).toBeGreaterThanOrEqual(3);
    expect((await generateGame('p', 'feynman', { topic: '' })).game?.data.concepts).toContain('Assets');
    mockAsk.mockResolvedValueOnce(json({ stations: [{ image: 'A vivid image of assets' }] }));
    const palace = await generateGame('p', 'palace', { topic: '' });
    expect(palace.game?.data.stations[0].image).toBe('A vivid image of assets');
    expect(palace.game?.data.stations[1].image).toMatch(/Picture "Equity" in the hallway/);
    const cloze = await generateGame('p', 'cloze', { topic: '' }).catch((e: Error) => e);
    expect(cloze instanceof Error ? cloze.message : 'ok').toMatch(/ok|Not enough sentences/);
  });
  it('true or false, mistakes, boss, ladder and exam use the model once or twice', async () => {
    mockAsk.mockResolvedValueOnce(tf);
    expect((await generateGame('p', 'truefalse', { topic: 'x' })).game?.data.statements).toHaveLength(6);
    mockAsk.mockResolvedValueOnce(json({ statements: Array.from({ length: 5 }, (_, i) => ({ text: `False statement ${i} is wrong`, true: false, fix: 'the correct fact', src: [1] })) }));
    const mistakes = await generateGame('p', 'mistake', { topic: '' }).catch((e: Error) => e);
    expect(mistakes instanceof Error ? mistakes.message : 'ok').toMatch(/ok|false statements/);
    mockAsk.mockResolvedValueOnce(mc(9));
    expect((await generateGame('p', 'boss', { topic: '' })).game?.data.questions).toHaveLength(9);
    mockAsk.mockResolvedValueOnce(mc(12));
    const ladder = await generateGame('p', 'ladder', { topic: '' });
    expect(ladder.game?.data.questions).toHaveLength(10); expect(ladder.game?.data.spares).toHaveLength(2);
    mockAsk.mockResolvedValueOnce(mc(4));
    await expect(generateGame('p', 'ladder', { topic: '' })).rejects.toThrow(/enough questions for a ladder/);
    mockAsk.mockResolvedValueOnce(mc(10)).mockResolvedValueOnce(tf);
    const exam = await generateGame('p', 'exam', { topic: '' });
    expect(exam.game?.data.mc).toHaveLength(10); expect(exam.game?.data.minutes).toBeGreaterThanOrEqual(5);
    mockAsk.mockResolvedValueOnce(mc(10)).mockResolvedValue('not json');
    expect((await generateGame('p', 'exam', { topic: '' })).game?.data.tf).toEqual([]);
  });
  it('timeline, sort, quiz board and concept map check their data', async () => {
    mockAsk.mockResolvedValueOnce(json({ kind: 'dates', items: [{ text: 'Third', order: 3 }, { text: 'First', order: 1 }, { text: 'Second', order: 2 }, { text: 'Fourth', order: 4 }] }));
    const timeline = await generateGame('p', 'timeline', { topic: '' });
    expect(timeline.game?.data.kind).toBe('dates'); expect(timeline.game?.data.items.map((i: any) => i.text)).toEqual(['First', 'Second', 'Third', 'Fourth']);
    mockAsk.mockResolvedValue(json({ items: [{ text: 'only' }] }));
    await expect(generateGame('p', 'timeline', { topic: '' })).rejects.toThrow(/clear order/);
    mockAsk.mockReset();
    mockAsk.mockResolvedValueOnce(json({ buckets: ['A', 'B'], items: Array.from({ length: 7 }, (_, i) => ({ text: `item ${i}`, bucket: i % 2, why: 'w' })) }));
    expect((await generateGame('p', 'sort', { topic: '' })).game?.data.items).toHaveLength(7);
    mockAsk.mockResolvedValue(json({ buckets: ['A'], items: [] }));
    await expect(generateGame('p', 'sort', { topic: '' })).rejects.toThrow(/sorting game/);
    mockAsk.mockReset();
    mockAsk.mockResolvedValueOnce(json({ categories: ['Cat one', 'Cat two', 'Cat three'] }))
      .mockResolvedValueOnce(json({ clues: [{ clue: 'Clue a', answer: 'Ans a' }, { clue: 'Clue b', answer: 'Ans b' }] }))
      .mockRejectedValueOnce(new Error('model failed'))
      .mockResolvedValueOnce(json({ clues: [{ clue: 'Clue c', answer: 'Ans c' }] }));
    const steps: string[] = [];
    const board = await generateGame('p', 'jeopardy', { topic: '', onStep: (m) => steps.push(m) });
    expect(board.game?.data.board.map((c: any) => c.name)).toEqual(['Cat one', 'Cat three']);
    expect(steps.some((s) => /Writing clues 3 of 3/.test(s))).toBe(true);
    mockAsk.mockReset(); mockAsk.mockResolvedValue(json({ categories: ['Only'] }));
    await expect(generateGame('p', 'jeopardy', { topic: '' })).rejects.toThrow(/did not choose categories/);
    mockAsk.mockReset();
    mockAsk.mockResolvedValueOnce(json({ nodes: [{ id: 'a', label: 'A' }, { label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }], edges: [{ from: 'a', to: 'n2', label: 'causes' }, { from: 'a', to: 'c', label: 'needs' }, { from: 'c', to: 'd', label: 'part of' }, { from: 'a', to: 'a', label: 'self' }, { from: 'a', to: 'd', label: 'x' }] }));
    const map = await generateGame('p', 'conceptmap', { topic: '' });
    expect(map.game?.data.nodes).toHaveLength(4); expect(map.game?.data.edges).toHaveLength(4);
    mockAsk.mockResolvedValue(json({ nodes: [], edges: [] }));
    await expect(generateGame('p', 'conceptmap', { topic: '' })).rejects.toThrow(/concept map/);
  });
  it('podcast quiz needs a saved episode and usable questions; live games only need sources', async () => {
    await expect(generateGame('p', 'podcastquiz', { topic: '' })).rejects.toThrow(/podcast episode/);
    mockSaved.p = [{ kind: 'podcast', createdAt: 5, title: 'Episode', podcast: [{ host: 'A', text: 'Hello' }, { host: 'B', text: 'World' }], sources: [], hosts: ['A', 'B'] }];
    mockAsk.mockResolvedValueOnce(json({ questions: [{ q: 'Who spoke?', options: ['A', 'B', 'C'], answer: 0, line: 9 }, { q: 'Next?', options: ['A', 'B', 'C'], answer: 1, line: -3 }, { q: '', options: ['A'], answer: 0 }] }));
    const quiz = await generateGame('p', 'podcastquiz', { topic: '' });
    expect(quiz.title).toBe('Podcast quiz: Episode'); expect(quiz.game?.data.questions.map((q: any) => q.line)).toEqual([1, 0]);
    mockAsk.mockResolvedValue(json({ questions: [] }));
    await expect(generateGame('p', 'podcastquiz', { topic: '' })).rejects.toThrow(/usable questions/);
    expect((await generateGame('p', 'tutor', { topic: '' })).game?.data.goal).toMatch(/main ideas/);
    expect((await generateGame('p', 'levels', { topic: 'Leases' })).game?.data.topic).toBe('Leases');
    expect((await generateGame('p', 'mnemonic', { topic: '' })).game?.data.results).toEqual([]);
    await expect(generateGame('p', 'nope' as never, { topic: '' })).rejects.toThrow(/Unknown game/);
  });
});

describe('live play-time calls', () => {
  it('grades an explanation and clamps the score', async () => {
    mockAsk.mockResolvedValueOnce(json({ score: 14.6, correct: ['Right idea', ''], missed: [{ point: 'Missing', src: [1] }, 'plain text point'], wrong: [{ claim: 'Wrong claim', fix: 'Fix', src: [2] }, { claim: '' }], follow_up: 'Why?' }));
    const g = await gradeExplanation([{ n: 1 } as never, { n: 2 } as never], 'Leases', 'It is a contract');
    expect(g).toMatchObject({ score: 10, correct: ['Right idea'], followUp: 'Why?' });
    expect(g.missed.map((m) => m.point)).toEqual(['Missing', 'plain text point']);
    expect(g.wrong).toHaveLength(1);
    mockAsk.mockResolvedValueOnce(json({ score: -3 }));
    expect((await gradeExplanation([{ n: 1 } as never], 'x', 'y')).score).toBe(0);
  });
  it('explains at each level and makes mnemonics', async () => {
    mockAsk.mockResolvedValue('An explanation [1].');
    for (let level = 0; level < 5; level++) expect(await explainAtLevel([{ n: 1 } as never], 'Leases', level)).toBe('An explanation [1].');
    mockAsk.mockResolvedValueOnce(json({ acronym: 'ABC', sentence: 'A big cat', rhyme: 'rhyme', story: 'story' }));
    expect(await makeMnemonics(['a', 'b', 'c'])).toEqual({ acronym: 'ABC', sentence: 'A big cat', rhyme: 'rhyme', story: 'story' });
  });
});
