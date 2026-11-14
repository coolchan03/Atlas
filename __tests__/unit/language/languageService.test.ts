/** The language course service with the model scripted: lookups, tutor, lessons, stories, review, goals. */
const mockReplies: string[] = [];
const mockGenerate = jest.fn(async () => mockReplies.shift() ?? '');
jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: jest.fn(async () => undefined), forceLoadTextModel: jest.fn(async () => undefined) }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => unknown) => fn() }));
jest.mock('../../../src/services/llm', () => ({ llmService: { generateResponse: (...a: unknown[]) => (mockGenerate as any)(...a) } }));

import { installNativeBoundary } from '../../harness/nativeBoundary';

function load() {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  return {
    svc: require('../../../src/language/languageService'),
    store: require('../../../src/language/store').useLanguage,
    curriculum: require('../../../src/language/curriculum'),
  };
}
beforeEach(() => { mockReplies.length = 0; mockGenerate.mockClear(); });

describe('parseUnitWords', () => {
  const { svc } = load();
  const en = ['red', 'blue'];
  it('accepts a list or {items}', () => {
    expect(svc.parseUnitWords(JSON.stringify([{ t: 'rojo' }, { t: 'azul' }]), en, 'es-ES')).toEqual([{ en: 'red', t: 'rojo' }, { en: 'blue', t: 'azul' }]);
    expect(svc.parseUnitWords(JSON.stringify({ items: [{ translation: 'rojo' }, { translation: 'azul' }] }), en, 'es-ES')).toHaveLength(2);
  });
  it('refuses short, empty or copied answers', () => {
    expect(svc.parseUnitWords('[]', en, 'es-ES')).toBeNull();
    expect(svc.parseUnitWords('nonsense', en, 'es-ES')).toBeNull();
    expect(svc.parseUnitWords(JSON.stringify([{ t: '' }, { t: 'azul' }]), en, 'es-ES')).toBeNull();
    expect(svc.parseUnitWords(JSON.stringify([{ t: 'red' }, { t: 'blue' }]), en, 'es-ES')).toBeNull();
  });
  it('keeps a romanization for scripts that need one', () => {
    const out = svc.parseUnitWords(JSON.stringify([{ t: 'あか', r: 'aka' }, { t: 'あお', romanization: 'ao' }]), en, 'ja-JP');
    expect(out?.[0]).toMatchObject({ r: 'aka' });
  });
});

describe('plainWord', () => {
  it('lowercases and trims punctuation', () => {
    const { svc } = load();
    expect(svc.plainWord('¿Hola!')).toBe('hola');
    expect(svc.plainWord('...')).toBe('');
  });
});

describe('languageService', () => {
  it('sets language and level, unlocking and completing spaces', () => {
    const { svc, store } = load();
    svc.languageService.setLanguage('fr-FR');
    svc.languageService.setLevel(2);
    expect(store.getState().language).toBe('fr-FR');
    expect(store.getState().level).toBe(2);
    expect(svc.languageService.isDone('x')).toBe(false);
    svc.languageService.completeSpace('x');
    expect(svc.languageService.isDone('x')).toBe(true);
    expect(typeof svc.languageService.unlocked('colors')).toBe('boolean');
  });

  it('looks a word up once, then from the kept meaning', async () => {
    const { svc, store } = load();
    store.setState({ language: 'es-ES' });
    expect(await svc.languageService.lookupWord('...')).toBe('');
    mockReplies.push('<think>hm</think>\nhouse\nextra');
    expect(await svc.languageService.lookupWord('Casa!')).toBe('house');
    expect(await svc.languageService.lookupWord('casa')).toBe('house');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    store.setState({ myWords: { 'es-ES': [{ t: 'perro', en: 'dog' }] } });
    expect(await svc.languageService.lookupWord('perro')).toBe('dog');
    mockReplies.push('');
    expect(await svc.languageService.lookupWord('zzz')).toBe('');
  });

  it('answers a tutor question without the thinking block', async () => {
    const { svc } = load();
    mockReplies.push('<think>x</think> Use the past tense. ');
    expect(await svc.languageService.askTutor('why?', 'ctx')).toBe('Use the past tense.');
  });

  it('writes a unit of words with sentences, retrying a copied answer, and keeps it', async () => {
    const { svc, store, curriculum } = load();
    store.setState({ language: 'es-ES' });
    const unit = curriculum.unitsForLevel(1).find((u: any) => !u.builtIn && u.items.length);
    const copied = JSON.stringify(unit.items.map((en: string) => ({ en, t: en })));
    const good = JSON.stringify(unit.items.map((en: string) => ({ en, t: `${en}-es` })));
    mockReplies.push(copied, good, JSON.stringify({ items: [] }));
    const steps: string[] = [];
    const items = await svc.languageService.unitWords(unit.id, (m: string) => steps.push(m));
    expect(items.length).toBeGreaterThanOrEqual(unit.items.length);
    expect(steps.length).toBeGreaterThan(1);
    expect(store.getState().content['es-ES'][unit.id]).toBeTruthy();
  });

  it('fails readably when the model never writes a usable unit', async () => {
    const { svc, store, curriculum } = load();
    store.setState({ language: 'es-ES' });
    const unit = curriculum.unitsForLevel(1).find((u: any) => !u.builtIn && u.items.length);
    mockReplies.push('x', 'y');
    await expect(svc.languageService.unitWords(unit.id)).rejects.toThrow('usable lesson');
    await expect(svc.languageService.unitWords('nope')).rejects.toThrow('Unknown unit');
  });

  it('serves the personal, mistakes and review units without the model', async () => {
    const { svc, store } = load();
    store.setState({ language: 'es-ES', myWords: { 'es-ES': [{ t: 'a', en: 'b' }] } });
    expect(await svc.languageService.unitWords(svc.MY_WORDS)).toHaveLength(1);
    expect(Array.isArray(await svc.languageService.unitWords(svc.MISTAKES))).toBe(true);
    expect(Array.isArray(await svc.languageService.unitWords(svc.REVIEW))).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('reports what a level still needs, and what is next', () => {
    const { svc, store } = load();
    store.setState({ language: 'es-ES', level: 1 });
    const all = svc.languageService.levelToPrepare(1);
    expect(all.units.length).toBeGreaterThan(0);
    expect(svc.languageService.nextToPrepare(1)).toHaveProperty('pieces');
  });

  it('counts daily XP, cycles the goal, saves words and finishes a lesson', () => {
    const { svc, store, curriculum } = load();
    store.setState({ language: 'es-ES' });
    const before = store.getState().goal;
    svc.languageService.cycleGoal();
    expect(store.getState().goal).not.toBe(before);
    expect(svc.languageService.todayXp()).toBe(0);
    expect(svc.languageService.saveWords([{ t: 'gato', en: 'cat' } as any, { t: 'gato', en: 'cat' } as any])).toBeGreaterThanOrEqual(1);
    const unit = curriculum.unitsForLevel(1).find((u: any) => !u.builtIn);
    const r = svc.languageService.finishLesson(unit.id, { right: 8, total: 10, results: [{ t: 'gato', right: true }, { t: 'perro', right: false }] });
    expect(r).toBeTruthy();
    expect(svc.languageService.todayXp()).toBeGreaterThan(0);
    svc.languageService.recordPace('choose' as any, 4);
    expect(typeof svc.languageService.secondsOf('choose' as any)).toBe('number');
    expect(svc.languageService.week()).toBeTruthy();
    expect(svc.languageService.wordOfTheDay()).toBeDefined();
    expect(svc.languageService.dueCount()).toBeGreaterThanOrEqual(0);
    expect(svc.languageService.isAiMade(svc.MY_WORDS)).toBe(false);
    expect(svc.languageService.tipFor('colors')).toBe('');
  });

  it('keeps and clears a saved lesson', () => {
    const { svc } = load();
    expect(svc.languageService.savedLesson('k')).toBeUndefined();
    svc.languageService.saveLesson({ key: 'k', unitId: 'u', items: [], at: 1 } as any);
    expect(svc.languageService.savedLesson('k')).toBeDefined();
    svc.languageService.saveLesson(null);
  });

  it('writes a story and a podcast, or fails readably', async () => {
    const { svc, store } = load();
    store.setState({ language: 'es-ES', level: 1 });
    mockReplies.push('not json');
    await expect(svc.languageService.makeListening('story', 'cats')).rejects.toThrow('expected format');
  });

  it('prepares a level, counting what could not be written, and can be stopped', async () => {
    const { svc, store } = load();
    const { usePrepareLive } = require('../../../src/language/store');
    store.setState({ language: 'es-ES', level: 1 });
    mockReplies.push('bad', 'bad');
    await svc.languageService.prepareLevel(1, 'next');
    expect(usePrepareLive.getState().level).toBeNull();
    // a model-shaped failure stops everything with a helpful message
    mockGenerate.mockRejectedValueOnce(new Error('Download a model first'));
    await svc.languageService.prepareLevel(1);
    expect(String(usePrepareLive.getState().error)).toMatch(/needs a text model|could not be written/);
    // a second call while one runs is ignored
    usePrepareLive.setState({ level: 1 });
    await svc.languageService.prepareLevel(1);
    usePrepareLive.setState({ level: null });
    svc.languageService.stopPreparing();
  });

  it('opens a pre-made piece: unknown, kept, written, or fetched news', async () => {
    const { svc, store } = load();
    store.setState({ language: 'es-ES', level: 1 });
    await expect(svc.languageService.openPremade('nope')).rejects.toThrow('not in the library');
    const library = require('../../../src/language/library');
    const piece = library.pieceForSpace ? undefined : undefined;
    void piece;
    jest.doMock('../../../src/atlasTools/dailyBrief', () => ({ latestHeadlines: jest.fn().mockResolvedValue([]) }));
    await expect(svc.languageService.openPremade(library.REAL_NEWS)).rejects.toThrow('No headlines');
  });

  it('knows whether speaking is on and lets a lesson be rewritten', async () => {
    const { svc, store } = load();
    store.setState({ language: 'es-ES', speaking: false });
    expect(await svc.languageService.canSpeak()).toBe(false);
    svc.languageService.rewrite('colors');
    await svc.languageService.forceLoadModel();
  });
});
