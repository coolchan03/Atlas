import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

/**
 * Android Keystore-backed storage for persisted chat state.
 * The encrypted record has a separate key, so migration never overwrites
 * plaintext until a decrypt round-trip confirms the ciphertext is usable.
 * Fail closed: a missing native crypto bridge must never save plaintext.
 */
const STORAGE_KEY = 'local-llm-chat-storage';
const ENCRYPTED_KEY = 'atlas-chat-encrypted-v1';
// Streaming-only state changes trigger Zustand persist but should not encrypt
// the unchanged conversation archive on every generated token.
let lastPersistedValue: string | null = null;
let pendingWrites: Promise<void> = Promise.resolve();

function cryptoModule() {
  const module = NativeModules.AtlasDevice;
  if (Platform.OS !== 'android' || !module?.encryptChatState || !module?.decryptChatState) {
    throw new Error('Encrypted chat storage requires a compatible Android Atlas build.');
  }
  return module as {
    encryptChatState(value: string): Promise<string>;
    decryptChatState(value: string): Promise<string>;
  };
}

async function encryptAndVerify(value: string): Promise<string> {
  const api = cryptoModule();
  const encrypted = await api.encryptChatState(value);
  if (typeof encrypted !== 'string' || !encrypted.startsWith('atlasenc:v1:') ||
      await api.decryptChatState(encrypted) !== value) {
    throw new Error('Chat storage encryption verification failed.');
  }
  return encrypted;
}

export const encryptedChatStorage = {
  async getItem(key: string): Promise<string | null> {
    if (key !== STORAGE_KEY) throw new Error('Unexpected encrypted chat storage key.');
    const encrypted = await AsyncStorage.getItem(ENCRYPTED_KEY);
    if (encrypted !== null) {
      const plaintext = await cryptoModule().decryptChatState(encrypted);
      // Recover from an interrupted migration where the old cleartext key was
      // not removed after the encrypted write completed.
      if (await AsyncStorage.getItem(STORAGE_KEY) !== null) {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
      lastPersistedValue = plaintext;
      return plaintext;
    }
    const legacy = await AsyncStorage.getItem(STORAGE_KEY);
    if (legacy === null) return null;
    const ciphertext = await encryptAndVerify(legacy);
    await AsyncStorage.setItem(ENCRYPTED_KEY, ciphertext);
    // Remove plaintext only after a successfully verified encrypted write.
    if (await cryptoModule().decryptChatState((await AsyncStorage.getItem(ENCRYPTED_KEY)) || '') !== legacy) {
      throw new Error('Encrypted chat migration verification failed.');
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    lastPersistedValue = legacy;
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (key !== STORAGE_KEY) throw new Error('Unexpected encrypted chat storage key.');
    // Serialize writes so a slower encryption call for an earlier chat state
    // can never overwrite a newer saved conversation.
    const task = pendingWrites.then(async () => {
      if (value === lastPersistedValue) return;
      const ciphertext = await encryptAndVerify(value);
      await AsyncStorage.setItem(ENCRYPTED_KEY, ciphertext);
      await AsyncStorage.removeItem(STORAGE_KEY);
      lastPersistedValue = value;
    });
    pendingWrites = task.catch(() => undefined);
    return task;
  },
  async removeItem(key: string): Promise<void> {
    if (key !== STORAGE_KEY) throw new Error('Unexpected encrypted chat storage key.');
    const task = pendingWrites.then(async () => {
      await AsyncStorage.multiRemove([ENCRYPTED_KEY, STORAGE_KEY]);
      lastPersistedValue = null;
    });
    pendingWrites = task.catch(() => undefined);
    return task;
  },
};
