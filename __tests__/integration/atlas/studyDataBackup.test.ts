/** Everything added for studying survives a backup and a restore: document marks, roles and tax info, courses with their written lessons and sources, exam prep with its folder, and the missed questions. Only storage, the file picker and the password encryption are faked. */
import { NativeModules, Platform } from 'react-native';
import { exportBackup, importBackup } from '../../../src/atlasTools/backup';

const mockStore = new Map<string, string>();
let mockArchive = '';
jest.mock('../../../src/atlasTools/projectBackupFiles', () => ({
  collectProjectFiles: jest.fn(async () => []), restoreProjectFiles: jest.fn(async () => 0),
  validateProjectFiles: (...a: any[]) => (jest.requireActual('../../../src/atlasTools/projectBackupFiles') as any).validateProjectFiles(...a),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
  multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, mockStore.get(k) ?? null])),
  multiSet: jest.fn(async (items: [string, string][]) => { for (const [k, v] of items) mockStore.set(k, v); }),
}}));
jest.mock('react-native-fs', () => ({ __esModule: true, default: {
  CachesDirectoryPath: '/cache', stat: jest.fn(async () => ({ size: Buffer.byteLength(mockArchive) })),
  readFile: jest.fn(async () => mockArchive), writeFile: jest.fn(async (_p: string, v: string) => { mockArchive = v; }), unlink: jest.fn(async () => undefined),
}}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => [{ uri: 'file:///cache/backup.atlasbackup', name: 'backup.atlasbackup' }]),
  saveDocuments: jest.fn(async () => [{ name: 'backup.atlasbackup' }]), types: { json: 'json', plainText: 'text', allFiles: '*/*' },
}));
jest.mock('../../../src/utils/resolvePickedFileUri', () => ({ resolvePickedFileUri: jest.fn(async () => '/cache/backup.atlasbackup') }));
jest.mock('../../../src/stores/encryptedChatStorage', () => ({ encryptedChatStorage: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) } }));
require('../../utils/registerStores').registerStoreRefs();

const persisted = (state: unknown) => JSON.stringify({ state, version: 0 });

it('keeps marks, roles, tax info, courses, exam prep and missed questions through a backup and restore', async () => {
  (Platform as any).OS = 'android';
  (NativeModules as any).AtlasDevice = {
    encryptPortableBackup: jest.fn(async (raw: string, password: string) => `atlasbackup:v1:${Buffer.from(JSON.stringify({ raw, password })).toString('base64')}`),
    decryptPortableBackup: jest.fn(async (v: string) => JSON.parse(Buffer.from(v.slice('atlasbackup:v1:'.length), 'base64').toString()).raw),
  };
  const before: Record<string, string> = {
    'local-llm-project-storage': persisted({ projects: [{ id: 'cpa', name: 'CPA Study', systemPrompt: 'x' }] }),
    'atlas-official-docs': persisted({ names: ['ASC 842 scan.pdf'], refused: ['Book.pdf'], roles: { 'Pub 17.pdf': 'reference' }, tax: { 'scan0042.pdf': { kind: 'publication', rank: 4, label: 'IRS publication', year: 2024, series: 'pub-17' } } }),
    'atlas-topics': persisted({ courses: [{ id: 'c1', title: 'FAR', projectId: 'cpa', prepareAhead: 8, content: { s1: { kind: 'lesson', sections: [{ heading: 'H', text: '**Bold** lesson' }], keyPoints: [] } }, cited: { s1: [{ source: 'Book.pdf', where: 'page 12', docId: 3, rank: 5, label: 'textbook', role: 'teach', text: 'passage' }] } }] }),
    'atlas-cpa-prep': persisted({ exams: { FAR: { projectId: 'cpa', topics: [{ id: 'a::b', area: 'a', name: 'Leases', covered: true }], courseId: 'c1' } }, groupProjectId: 'cpa' }),
    'atlas-exercises': persisted({ exercises: { 'sq-c1-s4-0': { id: 'sq-c1-s4-0', kind: 'mcq', prompt: 'Q', answer: 1 } }, progress: { 'sq-c1-s4-0': { box: 0, due: 0, attempts: 1, correct: 0, last: false } } }),
  };
  for (const [k, v] of Object.entries(before)) mockStore.set(k, v);
  await exportBackup('very-long-backup-password');
  mockStore.clear();
  await importBackup('very-long-backup-password');
  for (const [k, v] of Object.entries(before)) expect(JSON.parse(mockStore.get(k) ?? 'null')).toEqual(JSON.parse(v));
});
