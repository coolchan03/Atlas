import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { protectedProjectStorage, protectProject, unlockProject, permanentlyUnprotectProject, relockProjects } from '../../../src/stores/protectedProjectStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: {
    getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
  },
}));
const fakeProjects: any = { projects: [] };
const fakeChats: any = { conversations: [] };
const fakeStudy: any = { saved: {} };
const mockDocuments = jest.fn(async (..._args: any[]): Promise<any[]> => []);
jest.mock('../../../src/stores/projectStore', () => ({
  useProjectStore: {
    getState: () => fakeProjects,
    setState: (fn: any) => Object.assign(fakeProjects, typeof fn === 'function' ? fn(fakeProjects) : fn),
    persist: { hasHydrated: () => fakeProjects.isHydrated !== false },
  },
}));
jest.mock('../../../src/stores/chatStore', () => ({ useChatStore: { getState: () => fakeChats } }));
jest.mock('../../../src/study/engine', () => ({ useStudyStore: { getState: () => fakeStudy } }));
jest.mock('../../../src/services/rag', () => ({ ragService: {
  getDocumentsByProject: (...args: any[]) => mockDocuments(...args),
  exportProjectDocuments: async () => [],
  eraseProjectDocumentsFromIndex: async () => undefined,
  importProjectDocuments: async () => undefined,
} }));
const KEY = 'local-llm-project-storage';
const project = (id: string) => ({ id, name: 'My secret writing project', description: 'Story background', systemPrompt: 'Private story notes',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
const snapshot = (projects: any[]) => JSON.stringify({ state: { projects }, version: 0 });
const encode = (text: string) => `atlasitem:v1:${  Buffer.from(text).toString('base64')}`;
const decode = (blob: string) => Buffer.from(blob.slice('atlasitem:v1:'.length), 'base64').toString();

describe('selective protection for metadata-only projects', () => {
  const disk = new Map<string, string>();
  beforeEach(async () => {
    disk.clear(); fakeProjects.projects = []; fakeProjects.isHydrated = true; fakeChats.conversations = []; fakeStudy.saved = {};
    (Platform as any).OS = 'android';
    mockDocuments.mockReset().mockResolvedValue([]);
    (NativeModules as any).AtlasDevice = {
      createChatPinVerifier: jest.fn(async (pin: string) => `pin:v1:${  pin}`),
      encryptProtectedItem: jest.fn(async (_kind: string, _id: string, text: string, pin: string, verifier: string) => {
        if (verifier !== `pin:v1:${  pin}`) throw new Error('Wrong PIN');
        return encode(text);
      }),
      decryptProtectedItem: jest.fn(async (_kind: string, _id: string, blob: string, pin: string, verifier: string) => {
        if (verifier !== `pin:v1:${  pin}`) throw new Error('Wrong PIN');
        return decode(blob);
      }),
      removeProtectedItemKey: jest.fn(async () => true),
    };
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => disk.get(key) ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => { disk.set(key, value); });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { disk.delete(key); });
    await protectedProjectStorage.removeItem(KEY);
  });
  it('keeps ordinary projects readable without any mandatory encryption', async () => {
    await protectedProjectStorage.setItem(KEY, snapshot([project('ordinary')]));
    expect(disk.get(KEY)).toContain('My secret writing project');
    expect((NativeModules as any).AtlasDevice.encryptProtectedItem).not.toHaveBeenCalled();
  });
  it('encrypts only the chosen metadata-only project and permanently unlocks after PIN verification', async () => {
    fakeProjects.projects = [project('ordinary'), project('secret')];
    await protectedProjectStorage.setItem(KEY, snapshot(fakeProjects.projects));
    await protectProject('secret', '123456');
    const saved = disk.get(KEY)!;
    expect(saved).toContain('ordinary');
    const secureRecord = JSON.parse(saved).state.projects.find((p: any) => p.id === 'secret');
    expect(secureRecord.description).toBe('');
    expect(secureRecord.systemPrompt).toBe('');
    expect(secureRecord.name).toBe('Locked project');
    expect(secureRecord.protectedBlob).toMatch(/^atlasitem:v1:/);
    expect(fakeProjects.projects[1].name).toBe('Locked project');
    await expect(unlockProject('secret', 'wrong')).rejects.toThrow();
    await unlockProject('secret', '123456');
    expect(fakeProjects.projects[1].systemPrompt).toBe('Private story notes');
    await permanentlyUnprotectProject('secret', '123456');
    expect(fakeProjects.projects[1].pinVerifier).toBeUndefined();
    expect(disk.get(KEY)).toContain('Private story notes');
    expect((NativeModules as any).AtlasDevice.removeProtectedItemKey).toHaveBeenCalled();
  });
  it('preserves an unlocked project ciphertext while replacing a different project', async () => {
    fakeProjects.projects = [project('first'), project('second')];
    await protectedProjectStorage.setItem(KEY, snapshot(fakeProjects.projects));
    await protectProject('first', '111111');
    await protectProject('second', '222222');
    await unlockProject('first', '111111');
    await permanentlyUnprotectProject('second', '222222');
    const first = JSON.parse(disk.get(KEY)!).state.projects.find((p: any) => p.id === 'first');
    expect(decode(first.protectedBlob)).toContain('Private story notes');
    expect(decode(first.protectedBlob)).not.toContain('Locked project');
  });
  it('does not overwrite saved projects when backgrounded before hydration', async () => {
    await protectedProjectStorage.setItem(KEY, snapshot([project('on-disk')]));
    const before = disk.get(KEY);
    fakeProjects.projects = [];
    fakeProjects.isHydrated = false;
    await relockProjects();
    expect(disk.get(KEY)).toBe(before);
  });
  it('seals knowledge-base documents in the protected vault before replacing project metadata', async () => {
    fakeProjects.projects = [project('secret')];
    await protectedProjectStorage.setItem(KEY, snapshot(fakeProjects.projects));
    const { ragService } = require('../../../src/services/rag');
    const { protectedVault } = require('../../../src/stores/protectedProjectVault');
    const docs = [{ id: 1, name: 'Notes', path: '/private', size: 12, createdAt: '2026-01-01', enabled: 1, chunks: [] }];
    const exportSpy = jest.spyOn(ragService, 'exportProjectDocuments').mockResolvedValueOnce(docs);
    const sealSpy = jest.spyOn(protectedVault, 'seal').mockResolvedValueOnce(undefined);
    try {
      await protectProject('secret', '123456');
      expect(exportSpy).toHaveBeenCalledWith('secret');
      expect(sealSpy).toHaveBeenCalledWith('secret', '123456', 'pin:v1:123456', docs);
      expect(disk.get(KEY)).not.toContain('Private story notes');
      expect(fakeProjects.projects[0].name).toBe('Locked project');
    } finally {
      exportSpy.mockRestore();
      sealSpy.mockRestore();
    }
  });
  it('refuses projects with associated chats or saved study outputs', async () => {
    fakeProjects.projects = [project('secret')];
    await protectedProjectStorage.setItem(KEY, snapshot(fakeProjects.projects));
    fakeChats.conversations = [{ projectId: 'secret' }];
    await expect(protectProject('secret', '123456')).rejects.toThrow(/associated chats/);
    fakeChats.conversations = [];
    fakeStudy.saved.secret = [{ title: 'Quiz' }];
    await expect(protectProject('secret', '123456')).rejects.toThrow(/associated chats/);
  });
});
