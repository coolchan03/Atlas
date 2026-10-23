/**
 * Offline sync carries everything, not only chats and projects: two phones are played by
 * swapping the storage (the device boundary) between them. Settings, the language course
 * and recordings go across; settings tied to one phone's hardware stay; work on both phones
 * is kept; recording audio goes across in pieces; locked items go across sealed with their PIN.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockFiles = new Map<string, Buffer>();
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/docs',
  exists: jest.fn(async (p: string) => mockFiles.has(p)),
  mkdir: jest.fn(async () => undefined),
  stat: jest.fn(async (p: string) => ({ size: mockFiles.get(p)!.length })),
  read: jest.fn(async (p: string, len: number, pos: number) => mockFiles.get(p)!.subarray(pos, pos + len).toString('base64')),
  writeFile: jest.fn(async (p: string, data: string) => { mockFiles.set(p, Buffer.from(data, 'base64')); }),
  appendFile: jest.fn(async (p: string, data: string) => { mockFiles.set(p, Buffer.concat([mockFiles.get(p)!, Buffer.from(data, 'base64')])); }),
  moveFile: jest.fn(async (a: string, b: string) => { mockFiles.set(b, mockFiles.get(a)!); mockFiles.delete(a); }),
  unlink: jest.fn(async (p: string) => { mockFiles.delete(p); }),
}));

import { applyStores, localStores } from '../../../src/services/nearbySync/stores';
import { CHUNK_BYTES, receiveAudio, sendMissingAudio } from '../../../src/services/nearbySync/audio';
import { mergeProjects } from '../../../src/services/nearbySync/merge';
import { useLanguage } from '../../../src/language/store';
import { useRecordings } from '../../../src/atlasRecorder/store';

const store = (state: object, version = 0) => JSON.stringify({ state, version });

async function phone(items: Record<string, string>) {
  await AsyncStorage.clear();
  await AsyncStorage.multiSet(Object.entries(items));
}

beforeEach(() => mockFiles.clear());

it('takes the other phone\'s settings, merges the language course and recordings, and keeps hardware settings', async () => {
  // Phone A: dark theme, two lessons done, a recording.
  await phone({
    'local-llm-app-storage': store({ themeMode: 'dark', settings: { userName: 'Alex', nThreads: 8, inferenceBackend: 'vulkan' }, downloadedModels: [{ id: 'a' }] }),
    'atlas-language': store({ language: 'es-ES', xp: 200, progress: { 'es-ES': { basics: { stars: 3, lessons: 2 } } }, content: { 'es-ES': { basics: [{ en: 'hello', t: 'hola' }] } } }, 2),
    'atlas-recordings': store({ recordings: [{ id: 'rec-a', title: 'Meeting', status: 'done', audioPath: '/elsewhere/rec-a.wav' }], consent: true }),
  });
  const fromA = await localStores(1000);

  // Phone B: its own lesson and recording, different hardware.
  await phone({
    'local-llm-app-storage': store({ themeMode: 'light', settings: { userName: 'old', nThreads: 4, inferenceBackend: 'cpu' }, downloadedModels: [{ id: 'b' }] }),
    'atlas-language': store({ language: 'es-ES', xp: 50, progress: { 'es-ES': { intro: { stars: 1, lessons: 1 } } }, content: {} }, 2),
    'atlas-recordings': store({ recordings: [{ id: 'rec-b', title: 'Memo', status: 'done', audioPath: '/docs/atlas-recordings/rec-b.wav' }], consent: true }),
  });
  await localStores(500);
  const changed = await applyStores(fromA);
  expect(changed.sort()).toEqual(['atlas-language', 'atlas-recordings', 'local-llm-app-storage']);

  const app = JSON.parse((await AsyncStorage.getItem('local-llm-app-storage'))!).state;
  expect(app.themeMode).toBe('dark');
  expect(app.settings).toMatchObject({ userName: 'Alex', nThreads: 4, inferenceBackend: 'cpu' });
  expect(app.downloadedModels).toEqual([{ id: 'b' }]);

  // The running app has both phones' course progress, and both recordings.
  expect(useLanguage.getState().progress['es-ES']).toEqual({ basics: { stars: 3, lessons: 2 }, intro: { stars: 1, lessons: 1 } });
  expect(useLanguage.getState().xp).toBe(200);
  expect(useLanguage.getState().content['es-ES'].basics[0].t).toBe('hola');
  expect(useRecordings.getState().recordings.map((r) => [r.id, r.audioPath])).toEqual([
    ['rec-b', '/docs/atlas-recordings/rec-b.wav'], ['rec-a', '/docs/atlas-recordings/rec-a.wav'],
  ]);
});

it('ends with the same course language on both phones, not swapped', async () => {
  // Phone A switched to French more recently than phone B last changed its course.
  await phone({ 'atlas-language': store({ language: 'fr-FR', level: 2, xp: 10 }, 2) });
  const fromA = await localStores(2000);
  await phone({ 'atlas-language': store({ language: 'es-ES', level: 1, xp: 20 }, 2) });
  const fromB = await localStores(1000);

  await applyStores(fromA); // on B
  expect(useLanguage.getState()).toMatchObject({ language: 'fr-FR', level: 2, xp: 20 });

  await phone({ 'atlas-language': store({ language: 'fr-FR', level: 2, xp: 10 }, 2) });
  await localStores(2000);
  await applyStores(fromB); // on A: keeps its own newer choice
  expect(useLanguage.getState()).toMatchObject({ language: 'fr-FR', level: 2, xp: 20 });
});

it('does not bring back a recording deleted on the other phone, and removes this phone\'s copy', async () => {
  const rec = (id: string) => ({ id, title: id, status: 'done', audioPath: '' });
  await phone({ 'atlas-recordings': store({ recordings: [rec('gone'), rec('kept')] }) });
  const fromA = await localStores(1000);
  await phone({ 'atlas-recordings': store({ recordings: [rec('gone')] }) });
  mockFiles.set('/docs/atlas-recordings/gone.wav', Buffer.alloc(10, 1));
  await applyStores(fromA, { gone: 2000 });
  expect(useRecordings.getState().recordings.map((r) => r.id)).toEqual(['kept']);
  // The audio of the deleted recording goes too, not only its record.
  expect(mockFiles.has('/docs/atlas-recordings/gone.wav')).toBe(false);
});

it('keeps text-length settings such as maxTokens when sharing settings, but never credentials', () => {
  const { sanitizeBackupValue } = require('../../../src/atlasTools/backup');
  const shared = JSON.parse(sanitizeBackupValue(JSON.stringify({
    maxTokens: 512, max_tokens: 256, contextTokens: 4096, tokensPerSecond: 3, apiKey: 'sk-secret', accessToken: 'abc', token: 'x', password: 'p',
  })));
  expect(shared).toEqual({ maxTokens: 512, max_tokens: 256, contextTokens: 4096, tokensPerSecond: 3 });
});

it('sends recording audio the other phone lacks, in pieces, and it arrives whole', async () => {
  const audio = Buffer.alloc(CHUNK_BYTES * 2 + 123, 7);
  audio.write('RIFF', 0);
  mockFiles.set('/docs/atlas-recordings/rec-a.wav', audio);
  const pieces: number[] = [];
  const sent = await sendMissingAudio([{ id: 'rec-a', audioPath: '/docs/atlas-recordings/rec-a.wav' }], [], async (chunk) => {
    pieces.push(chunk.index);
    await receiveAudio({ ...chunk, id: 'rec-copy' });
  });
  expect(sent).toBe(1);
  expect(pieces).toEqual([0, 1, 2]);
  expect(mockFiles.get('/docs/atlas-recordings/rec-copy.wav')!.equals(audio)).toBe(true);
  expect(mockFiles.has('/docs/atlas-recordings/rec-copy.wav.part')).toBe(false);
  // Nothing is sent again once the other phone has it.
  expect(await sendMissingAudio([{ id: 'rec-a', audioPath: '/docs/atlas-recordings/rec-a.wav' }], ['rec-a'], async () => undefined)).toBe(0);
});

it('carries a locked project sealed with its PIN, never one tied to this phone', () => {
  const base = { description: '', systemPrompt: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', pinVerifier: 'v' };
  const portable = { ...base, id: 'locked-1', name: 'Locked project', protectedBlob: 'atlasbackup:v1:abc' };
  const deviceBound = { ...base, id: 'locked-2', name: 'Locked project', protectedBlob: 'atlasitem:v1:xyz' };
  const result = mergeProjects([], [portable, deviceBound], () => false);
  expect(result.items.map((p) => p.id)).toEqual(['locked-1']);
  // A newer sealed copy replaces this phone's locked copy, unless it is open right now.
  const newer = { ...portable, updatedAt: '2026-01-03T00:00:00.000Z', protectedBlob: 'atlasbackup:v1:def' };
  expect(mergeProjects([portable], [newer], () => false).items[0].protectedBlob).toBe('atlasbackup:v1:def');
  expect(mergeProjects([portable], [newer], () => true).items[0].protectedBlob).toBe('atlasbackup:v1:abc');
});

it('takes each setting from the phone that changed it last, so one phone does not undo the other', async () => {
  const app = (settings: object) => store({ themeMode: 'dark', settings });
  // Both phones start the same.
  await phone({ 'local-llm-app-storage': app({ enhanceImagePrompts: false, userName: 'Sam' }) });
  await localStores(100);
  // Phone A turns on prompt enhancement at 200.
  await AsyncStorage.setItem('local-llm-app-storage', app({ enhanceImagePrompts: true, userName: 'Sam' }));
  const fromA = await localStores(200);

  await phone({ 'local-llm-app-storage': app({ enhanceImagePrompts: false, userName: 'Sam' }) });
  await localStores(100);
  // Phone B later changes only the name, at 300.
  await AsyncStorage.setItem('local-llm-app-storage', app({ enhanceImagePrompts: false, userName: 'Alex' }));
  const fromB = await localStores(300);

  await applyStores(fromA); // on B: takes A's newer enhancement choice, keeps its own newer name
  expect(JSON.parse((await AsyncStorage.getItem('local-llm-app-storage'))!).state.settings)
    .toMatchObject({ enhanceImagePrompts: true, userName: 'Alex' });
  const fromBAfter = await localStores(400);

  await phone({ 'local-llm-app-storage': app({ enhanceImagePrompts: true, userName: 'Sam' }) });
  await localStores(200);
  await applyStores(fromB); // on A: the older copy from B does not turn enhancement back off
  await applyStores(fromBAfter);
  expect(JSON.parse((await AsyncStorage.getItem('local-llm-app-storage'))!).state.settings)
    .toMatchObject({ enhanceImagePrompts: true, userName: 'Alex' });
});
