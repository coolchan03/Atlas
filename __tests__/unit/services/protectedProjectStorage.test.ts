import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { protectedProjectStorage, protectProject, unlockProject, permanentlyUnprotectProject } from '../../../src/stores/protectedProjectStorage';

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
  },
}));
jest.mock('../../../src/stores/chatStore', () => ({ useChatStore: { getState: () => fakeChats } }));
jest.mock('../../../src/study/engine', () => ({ useStudyStore: { getState: () => fakeStudy } }));
jest.mock('../../../src/services/rag', () => ({ ragService: { getDocumentsByProject: (...args: any[]) => mockDocuments(...args) } }));
const KEY = 'local-llm-project-storage';
const project = (id: string) => ({ id, name: 'My secret writing project', description: 'Story background', systemPrompt: 'Private story notes',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
const snapshot = (projects: any[]) => JSON.stringify({ state: { projects }, version: 0 });
const encode = (text: string) => 'atlasitem:v1:' + Buffer.from(text).toString('base64');
const decode = (blob: string) => Buffer.from(blob.slice('atlasitem:v1:'.length), 'base64').toString();

describe('selective protection for metadata-only projects', () => {
  const disk = new Map<string, string>();
  beforeEach(async () => {
    disk.clear(); fakeProjects.projects = []; fakeChats.conversations = []; fakeStudy.saved = {};
    (Platform as any).OS = 'android';
    mockDocuments.mockReset().mockResolvedValue([]);
    (NativeModules as any).AtlasDevice = {
      createChatPinVerifier: jest.fn(async (pin: string) => 'pin:v1:' + pin),
      encryptProtectedItem: jest.fn(async (_kind: string, _id: string, text: string, pin: string, verifier: string) => {
        if (verifier !== 'pin:v1:' + pin) throw new Error('Wrong PIN');
        return encode(text);
      }),
      decryptProtectedItem: jest.fn(async (_kind: string, _id: string, blob: string, pin: string, verifier: string) => {
        if (verifier !== 'pin:v1:' + pin) throw new Error('Wrong PIN');
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
  it('refuses to claim projects with unencrypted knowledge-base documents are protected', async () => {
    fakeProjects.projects = [project('secret')];
    await protectedProjectStorage.setItem(KEY, snapshot(fakeProjects.projects));
    mockDocuments.mockResolvedValueOnce([{ id: 1 }]);
    await expect(protectProject('secret', '123456')).rejects.toThrow(/cannot yet be encrypted/);
    expect(disk.get(KEY)).toContain('Private story notes');
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
