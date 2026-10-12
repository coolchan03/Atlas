import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { encryptedChatStorage } from '../../../src/stores/encryptedChatStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: {
    getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), multiRemove: jest.fn(),
  },
}));
describe('encrypted chat persistence migration', () => {
  const records = new Map<string, string>();
  beforeEach(() => {
    records.clear();
    (Platform as any).OS = 'android';
    (NativeModules as any).AtlasDevice = {
      encryptChatState: jest.fn(async (plain: string) => 'atlasenc:v1:' + plain),
      decryptChatState: jest.fn(async (payload: string) => payload.replace(/^atlasenc:v1:/, '')),
    };
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => records.get(key) ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => { records.set(key, value); });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { records.delete(key); });
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => { keys.forEach(k => records.delete(k)); });
  });
  it('migrates plaintext only after verified encryption', async () => {
    records.set('local-llm-chat-storage', '{"state":{"conversations":[]}}');
    expect(await encryptedChatStorage.getItem('local-llm-chat-storage')).toContain('conversations');
    expect(records.has('local-llm-chat-storage')).toBe(false);
    expect(records.get('atlas-chat-encrypted-v1')).toMatch(/^atlasenc:v1:/);
  });
  it('preserves legacy plaintext if encryption fails', async () => {
    records.set('local-llm-chat-storage', 'important chats');
    (NativeModules as any).AtlasDevice.encryptChatState.mockRejectedValueOnce(new Error('Keystore unavailable'));
    await expect(encryptedChatStorage.getItem('local-llm-chat-storage')).rejects.toThrow();
    expect(records.get('local-llm-chat-storage')).toBe('important chats');
  });
  it('refuses to persist plaintext when bridge is missing', async () => {
    (NativeModules as any).AtlasDevice = undefined;
    await expect(encryptedChatStorage.setItem('local-llm-chat-storage', 'secret')).rejects.toThrow();
    expect(records.size).toBe(0);
  });
});
