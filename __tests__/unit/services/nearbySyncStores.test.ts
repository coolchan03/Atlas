/** What goes to the other phone and how its stores are folded into this one. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { installNativeBoundary } from '../../harness/nativeBoundary';

function load() {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  return require('../../../src/services/nearbySync/stores');
}
const app = (settings: Record<string, unknown>, themeMode = 'dark', extra: Record<string, unknown> = {}) => JSON.stringify({ state: { settings, themeMode, ...extra }, version: 1 });

beforeEach(async () => { await AsyncStorage.clear(); });

describe('shareable', () => {
  it('keeps only the person\'s settings of the app store and drops hardware ones', () => {
    const { shareable, APP_STORE } = load();
    const out = JSON.parse(shareable(APP_STORE, app({ userName: 'Sam', nThreads: 4, gpuLayers: 9 }, 'light', { downloadedModels: [1] })));
    expect(out.state.themeMode).toBe('light');
    expect(out.state.settings.userName).toBe('Sam');
    expect(out.state.downloadedModels).toBeUndefined();
    expect(out.state.settings.nThreads).toBeUndefined();
  });
  it('passes other stores through and refuses unsafe ones', () => {
    const { shareable } = load();
    expect(shareable('atlas-checklists', JSON.stringify({ state: { a: 1 }, version: 0 }))).toBeTruthy();
    expect(shareable('not-a-real-store', 'x')).toBeNull();
  });
});

describe('combine', () => {
  it('takes each newer setting, keeps older ones, and skips when nothing is newer', () => {
    const { combine, APP_STORE } = load();
    const local = app({ a: 1, b: 2 }, 'dark');
    const remote = app({ a: 10, b: 20 }, 'light');
    const merged = JSON.parse(combine(APP_STORE, { local, remote, times: { mine: { 'settings.a': 5, 'settings.b': 50, themeMode: 1 }, theirs: { 'settings.a': 9, 'settings.b': 10, themeMode: 9 } } }));
    expect(merged.state.settings).toMatchObject({ a: 10, b: 2 });
    expect(merged.state.themeMode).toBe('light');
    expect(combine(APP_STORE, { local, remote, times: { mine: { 'settings.a': 9, 'settings.b': 9, themeMode: 9 }, theirs: { 'settings.a': 1, 'settings.b': 1, themeMode: 1 } } })).toBeNull();
    expect(JSON.parse(combine(APP_STORE, { local: null, remote })).state.settings).toMatchObject({ a: 10 });
    expect(combine(APP_STORE, { local, remote, times: { mine: {} } })).toBeTruthy();
  });

  it('merges recordings by id, keeps deletions deleted, and never takes one still processing', () => {
    const { combine, RECORDINGS } = load();
    const mine = JSON.stringify({ state: { recordings: [{ id: 'a', status: 'done' }, { id: 'gone', status: 'done' }], consent: true }, version: 0 });
    const theirs = JSON.stringify({ state: { recordings: [{ id: 'a', status: 'done' }, { id: 'b', status: 'done' }, { id: 'p', status: 'processing' }, { id: 'bad id!', status: 'done' }, { id: 'del', status: 'done' }] } });
    const out = JSON.parse(combine(RECORDINGS, { local: mine, remote: theirs, deletedRecordings: { gone: 1, del: 1 } }));
    expect(out.state.recordings.map((r: any) => r.id)).toEqual(['a', 'b']);
    expect(out.state.recordings[1].audioPath).toMatch(/b\.wav$/);
    expect(combine(RECORDINGS, { local: mine, remote: JSON.stringify({ state: { recordings: [] } }) })).toBeNull();
    expect(JSON.parse(combine(RECORDINGS, { local: null, remote: theirs })).state.recordings.length).toBe(3);
  });

  it('merges the language course and the exercises item by item, or takes the remote when there is no local copy', () => {
    const { combine, LANGUAGE, EXERCISES } = load();
    const l = JSON.stringify({ state: { xp: 5 }, version: 1 });
    const r = JSON.stringify({ state: { xp: 9 }, version: 1 });
    expect(JSON.parse(combine(LANGUAGE, { local: l, remote: r })).state.xp).toBe(9);
    expect(combine(LANGUAGE, { local: null, remote: r })).toBe(r);
    expect(combine(EXERCISES, { local: null, remote: r })).toBe(r);
    expect(combine('atlas-unknown', { local: l, remote: r })).toBe(r);
  });
});

describe('mergeLanguage', () => {
  it('keeps the best of both phones', () => {
    const { mergeLanguage } = load();
    const a = JSON.stringify({ state: {
      language: 'es-ES', xp: 10, streak: { count: 2 }, saved: { k: 1 },
      content: { 'es-ES': { u1: [{ t: 'a', en: 'a' }] } }, tips: { 'es-ES': { u1: 'tip' } }, glossary: { 'es-ES': { hola: 'hi' } },
      progress: { 'es-ES': { s1: { stars: 1, lessons: 5 }, s2: { stars: 3, lessons: 1 } } },
      memory: { 'es-ES': { w: { due: 5 }, x: { due: 1 } } },
      listening: { 'es-ES': [{ pieceId: 'p', createdAt: 1 }] }, myWords: { 'es-ES': [{ t: 'gato', en: 'cat' }] },
      history: { 'es-ES': { xp: 5, lessons: 1 } },
    }, version: 1 });
    const b = JSON.stringify({ state: {
      language: 'fr-FR', xp: 7, streak: { count: 4 }, saved: { j: 2 },
      content: { 'es-ES': { u2: [{ t: 'b', en: 'b' }] }, 'fr-FR': { u1: [] } }, tips: {}, glossary: { 'es-ES': { adios: 'bye' } },
      progress: { 'es-ES': { s1: { stars: 3, lessons: 2 } } },
      memory: { 'es-ES': { w: { due: 9 }, y: { due: 2 } } },
      listening: { 'es-ES': [{ pieceId: 'p', createdAt: 1 }, { pieceId: 'q', createdAt: 2 }] }, myWords: { 'es-ES': [{ t: 'gato', en: 'cat' }, { t: 'perro', en: 'dog' }] },
      history: { 'es-ES': { xp: 9, lessons: 0 }, 'fr-FR': { xp: 1, lessons: 1 } },
    }, version: 3 });
    const merged = JSON.parse(mergeLanguage(a, b, true));
    expect(merged.version).toBe(3);
    expect(merged.state.xp).toBe(10);
    expect(merged.state.language).toBe('fr-FR');
    expect(merged.state.streak.count).toBe(4);
    expect(Object.keys(merged.state.content['es-ES'])).toEqual(['u1', 'u2']);
    expect(merged.state.progress['es-ES'].s1).toEqual({ stars: 3, lessons: 5 });
    expect(merged.state.memory['es-ES'].w.due).toBe(9);
    expect(merged.state.listening['es-ES']).toHaveLength(2);
    expect(merged.state.myWords['es-ES']).toHaveLength(2);
    expect(merged.state.history['es-ES']).toEqual({ xp: 9, lessons: 1 });
    expect(JSON.parse(mergeLanguage(a, b, false)).state.language).toBe('es-ES');
    expect(JSON.parse(mergeLanguage('{}', '{}')).state.xp).toBe(0);
  });
});

describe('localStores and applyStores', () => {
  it('dates each store by when its content changed, and times each setting', async () => {
    const { localStores, APP_STORE } = load();
    await AsyncStorage.setItem(APP_STORE, app({ userName: 'Sam' }));
    await AsyncStorage.setItem('atlas-checklists', JSON.stringify({ state: { a: 1 }, version: 0 }));
    const first = await localStores(100);
    expect(first[APP_STORE].changedAt).toBe(100);
    expect(first[APP_STORE].fields?.['settings.userName']).toBeDefined();
    await AsyncStorage.setItem(APP_STORE, app({ userName: 'Alex' }));
    const second = await localStores(200);
    expect(second[APP_STORE].changedAt).toBe(200);
    expect(second[APP_STORE].fields?.['settings.userName']).toBe(200);
    expect((await localStores(300))[APP_STORE].changedAt).toBe(200);
  });

  it('applies the other phone\'s newer stores, ignores unknown or malformed ones, and keeps this phone\'s replaced copy', async () => {
    const { applyStores, APP_STORE, syncedStoreKeys } = load();
    const { LIST_STORES } = require('../../../src/services/nearbySync/listMerge');
    const plain = syncedStoreKeys().find((k: string) => !LIST_STORES.has(k) && k !== APP_STORE && k !== 'atlas-recordings' && k !== 'atlas-language' && k !== 'atlas-exercises')!;
    await AsyncStorage.setItem(plain, JSON.stringify({ state: { a: 'mine' }, version: 0 }));
    const theirs = JSON.stringify({ state: { a: 'theirs' }, version: 0 });
    const changed = await applyStores({
      [plain]: { value: theirs, changedAt: Date.now() + 10_000 },
      'not-allowed': { value: 'x', changedAt: 1 },
      [APP_STORE]: { value: 5, changedAt: 1 },
      'atlas-recordings': { value: JSON.stringify({ state: { recordings: [{ id: 'r1', status: 'done' }] }, version: 0 }), changedAt: 5 },
    }, { gone: 1 });
    expect(changed).toEqual(expect.arrayContaining([plain]));
    expect(await AsyncStorage.getItem(plain)).toContain('theirs');
    expect(await applyStores(null)).toEqual([]);
    expect(await applyStores('x')).toEqual([]);
    // the same content again changes nothing
    expect(await applyStores({ [plain]: { value: theirs, changedAt: 1 } })).toEqual([]);
  });

  it('applies settings one by one with their times', async () => {
    const { applyStores, localStores, APP_STORE } = load();
    await AsyncStorage.setItem(APP_STORE, app({ userName: 'Sam', keep: 1 }));
    await localStores(100);
    const entry = { value: app({ userName: 'Alex', keep: 2 }), changedAt: 500, fields: { 'settings.userName': 400, 'settings.keep': 50, themeMode: 400 } };
    expect(await applyStores({ [APP_STORE]: entry })).toEqual([APP_STORE]);
    const saved = JSON.parse((await AsyncStorage.getItem(APP_STORE))!);
    expect(saved.state.settings.userName).toBe('Alex');
  });
});
