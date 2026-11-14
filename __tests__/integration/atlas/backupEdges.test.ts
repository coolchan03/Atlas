import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { exportBackup, importBackup, checkBackup } from '../../../src/atlasTools/backup';
const mockStore = new Map<string, string>();
let mockArchive = '';
let mockPicked: unknown[] = [{ uri: 'file:///cache/backup.atlasbackup', name: 'backup.atlasbackup' }];
let mockSize: number | null = null;
let mockFailSet = false;
const mockCollect = jest.fn(async (_ids: string[]) => [{
  projectId: 'therapy', name: 'history.pdf', size: 3, enabled: true,
  createdAt: '2026-01-01', base64: 'YWJj', chunks: [{ content: 'My history', position: 0 }],
}]);
const mockRestore = jest.fn(async (_files: any[], _ids: string[]) => 1);
jest.mock('../../../src/atlasTools/projectBackupFiles', () => ({
  collectProjectFiles: (...a: any[]) => mockCollect(...a as [string[]]),
  restoreProjectFiles: (...a: any[]) => mockRestore(...a as [any[], string[]]),
  // The real manifest check: backup.ts now validates every document before it changes anything.
  validateProjectFiles: (...a: any[]) => (jest.requireActual('../../../src/atlasTools/projectBackupFiles') as any).validateProjectFiles(...a),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiSet: jest.fn(async (items: [string,string][]) => { if (mockFailSet) { mockFailSet = false; throw new Error('disk full'); } for (const [k,v] of items) mockStore.set(k,v); }),
  multiRemove: jest.fn(async (keys: string[]) => { for (const k of keys) mockStore.delete(k); }),
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
}}));
jest.mock('react-native-fs', () => ({ __esModule: true, default: {
  CachesDirectoryPath: '/cache',
  stat: jest.fn(async () => ({ size: mockSize ?? Buffer.byteLength(mockArchive) })),
  readFile: jest.fn(async () => mockArchive),
  writeFile: jest.fn(async (_p: string, v: string) => { mockArchive = v; }),
  unlink: jest.fn(async () => undefined),
}}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => mockPicked),
  saveDocuments: jest.fn(async () => [{ name:'backup.atlasbackup' }]),
  types: { json:'json', plainText:'text', allFiles:'*/*' },
}));
jest.mock('../../../src/utils/resolvePickedFileUri', () => ({
  resolvePickedFileUri: jest.fn(async () => '/cache/backup.atlasbackup'),
}));
jest.mock('../../../src/stores/encryptedChatStorage', () => ({
  encryptedChatStorage: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
const projects = () => JSON.stringify({state:{projects:[{id:'therapy',name:'Therapy',systemPrompt:'Notes'}]},version:0});
require('../../utils/registerStores').registerStoreRefs();


const wrap = (data: unknown) => JSON.stringify(data);
const good = (version = 1, extra: Record<string, unknown> = {}) => wrap({ format: 'OffGridAtlasBackup', version, items: { 'local-llm-project-storage': projects() }, ...extra });

describe('backup edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockStore.clear(); mockArchive = ''; mockSize = null; mockFailSet = false;
    mockPicked = [{ uri: 'file:///cache/backup.atlasbackup', name: 'backup.atlasbackup' }];
    mockStore.set('local-llm-project-storage', projects());
    (Platform as any).OS = 'android';
    (NativeModules as any).AtlasDevice = {
      encryptPortableBackup: jest.fn(async (raw: string, password: string) => `atlasbackup:v1:${Buffer.from(JSON.stringify({ raw, password })).toString('base64')}`),
      decryptPortableBackup: jest.fn(async (v: string, password: string) => {
        const payload = JSON.parse(Buffer.from(v.slice('atlasbackup:v1:'.length), 'base64').toString());
        if (payload.password !== password) throw new Error('Wrong backup password');
        return payload.raw;
      }),
    };
  });

  it('says the update is needed when the phone cannot encrypt', async () => {
    (NativeModules as any).AtlasDevice = {};
    await expect(exportBackup('very-long-backup-password')).rejects.toThrow('updated Android');
  });

  it('refuses a short password', async () => {
    await expect(exportBackup('short')).rejects.toThrow('at least 12');
  });

  it('does nothing when the picker returns no file', async () => {
    mockPicked = [];
    expect(await importBackup()).toBeNull();
    expect(await checkBackup()).toBeNull();
  });

  it('refuses files that are too big, mixed up with the password, or not Atlas backups', async () => {
    mockArchive = good(); mockSize = 60 * 1024 * 1024;
    await expect(importBackup()).rejects.toThrow('50 MB');
    mockSize = null;
    await expect(importBackup('a-long-enough-password')).rejects.toThrow('not encrypted');
    mockArchive = 'atlasbackup:v1:xxxx';
    await expect(importBackup()).rejects.toThrow('requires its password');
    mockArchive = wrap({ format: 'other', version: 1, items: {} });
    await expect(importBackup()).rejects.toThrow('not a supported Atlas backup');
    mockArchive = wrap({ format: 'OffGridAtlasBackup', version: 3, items: {} });
    await expect(importBackup()).rejects.toThrow('not a supported Atlas backup');
    mockArchive = wrap({ format: 'OffGridAtlasBackup', version: 1, items: [] });
    await expect(importBackup()).rejects.toThrow('not a supported Atlas backup');
  });

  it('refuses backups with nothing restorable, and plain version 2 or chat backups', async () => {
    mockArchive = wrap({ format: 'OffGridAtlasBackup', version: 1, items: { 'some-secret': 'x', 'local-llm-project-storage': 5 } });
    await expect(importBackup()).rejects.toThrow('No supported backup settings');
    mockArchive = good(2, { projectFiles: [] });
    await expect(importBackup()).rejects.toThrow('must be password-encrypted');
    mockArchive = wrap({ format: 'OffGridAtlasBackup', version: 1, items: { 'local-llm-chat-storage': JSON.stringify({ state: { conversations: [] }, version: 0 }) } });
    await expect(importBackup()).rejects.toThrow(/encrypted backup|No supported/);
  });

  it('restores a plain version 1 backup and describes it', async () => {
    mockArchive = good();
    const report = await checkBackup();
    expect(typeof report).toBe('string');
    mockStore.clear();
    expect(await importBackup()).toBeGreaterThanOrEqual(1);
    expect(mockStore.has('local-llm-project-storage')).toBe(true);
  });

  it('puts the old settings back when a write fails half way', async () => {
    mockArchive = good();
    mockFailSet = true;
    await expect(importBackup()).rejects.toThrow('disk full');
    expect(mockStore.get('local-llm-project-storage')).toBe(projects());
  });

  it('exports chats and protected projects into an encrypted backup', async () => {
    const chat = JSON.stringify({ state: { conversations: [{ id: 'c1', title: 'Hi', messages: [] }] }, version: 0 });
    jest.doMock('../../../src/stores/encryptedChatStorage', () => ({
      encryptedChatStorage: { getItem: jest.fn(async () => chat), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
      openLockedChatsForBackup: jest.fn(async () => [{ id: 'c2', title: 'Locked', messages: [] }]),
    }));
    jest.doMock('../../../src/stores/protectedProjectStorage', () => ({ openProtectedProjectsForBackup: jest.fn(async () => [{ id: 'p9', name: 'Sealed' }]) }));
    jest.resetModules();
    const rn = require('react-native');
    rn.Platform.OS = 'android';
    rn.NativeModules.AtlasDevice = { encryptPortableBackup: async (raw: string, password: string) => `atlasbackup:v1:${Buffer.from(JSON.stringify({ raw, password })).toString('base64')}`, decryptPortableBackup: async () => '' };
    const backup = require('../../../src/atlasTools/backup');
    expect(await backup.exportBackup('very-long-backup-password')).toBeTruthy();
    const record = JSON.parse(Buffer.from(mockArchive.slice('atlasbackup:v1:'.length), 'base64').toString());
    const items = JSON.parse(record.raw).items;
    expect(items['local-llm-project-storage']).toContain('p9');
    expect(typeof backup.lockedChatsNotOpen()).toBe('number');
  });
});
