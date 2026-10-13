import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

function portableCrypto() {
  const mod = NativeModules.AtlasDevice;
  if (Platform.OS !== 'android' || !mod?.encryptPortableBackup || !mod?.decryptPortableBackup) {
    throw new Error('Portable encrypted backups require the updated Android Atlas build.');
  }
  return mod as { encryptPortableBackup(text: string, password: string): Promise<string>; decryptPortableBackup(text: string, password: string): Promise<string> };
}
import RNFS from 'react-native-fs';
import { pick, saveDocuments, types } from '@react-native-documents/picker';
import { resolvePickedFileUri } from '../utils/resolvePickedFileUri';

/**
 * Backup = every saved app setting in one JSON file: agents and their lessons, projects,
 * chats, learning history, voice and search settings, app settings.
 * NOT included: downloaded models and knowledge-base documents (re-import those).
 */
const MAGIC = 'OffGridAtlasBackup';
// Explicit persistent-store allowlist also permits restore on a fresh install.
// Add other reviewed store keys here as their schemas are audited.
const RESTORABLE_STORE_KEYS = new Set([
  'local-llm-chat-storage', 'local-llm-app-storage', 'local-llm-project-storage',
  'atlas-agent-storage', 'atlas-learning', 'atlas-study', 'atlas-voice-settings',
  // Saved map places, Survival Manual notes, library list and app preferences.
  // (Secret fields are stripped by stripSensitiveFields; API keys live in the Keychain.)
  'atlas-maps', 'atlas-survival-manual', 'atlas-offline-library', 'atlas-off-grid',
  'atlas-chat-prefs', 'atlas-daily-brief', 'atlas-low-power', 'remote-servers',
  'atlas-study-progress',
]);
// Never export or restore credentials, vault contents, or authentication state.
const EXCLUDED_BACKUP_KEYS = /auth|passphrase|lock|vault|keychain|credential|secret|token|api.?key|atlas-search-settings/i;
const SENSITIVE_FIELDS = /api.?key|secret|token|password|passphrase|credential/i;
function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveFields);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_FIELDS.test(key))
      .map(([key, item]) => [key, stripSensitiveFields(item)]));
  }
  return value;
}
function sanitizeBackupValue(raw: string): string | null {
  try { return JSON.stringify(stripSensitiveFields(JSON.parse(raw))); }
  catch { return null; }
}
function portableStoreValue(key: string, raw: string): string | null {
  const safe = sanitizeBackupValue(raw);
  if (!safe) return null;
  if (key !== 'local-llm-project-storage' && key !== 'local-llm-chat-storage') return safe;
  try {
    const parsed = JSON.parse(safe);
    const collection = key === 'local-llm-project-storage' ? 'projects' : 'conversations';
    if (!Array.isArray(parsed?.state?.[collection])) return null;
    // Never export device-bound protected items, nor restore ciphertext whose
    // Android Keystore key exists only on the device that created it.
    parsed.state[collection] = parsed.state[collection].filter((item: any) => !item.pinVerifier && !item.protectedBlob);
    return JSON.stringify(parsed);
  } catch { return null; }
}

function openLockedChats(): any[] {
  try {
    const { useChatStore } = require('../stores/chatStore');
    return useChatStore.getState().conversations
      .filter((c: any) => c.pinVerifier && Array.isArray(c.messages) && c.messages.length > 0)
      .map(({ pinVerifier: _v, protectedBlob: _b, ...rest }: any) => ({ ...rest, wasLocked: true }));
  } catch { return []; }
}

/** PIN-locked chats that a password backup would skip because they are not open right now. */
export function lockedChatsNotOpen(): number {
  try {
    const { useChatStore } = require('../stores/chatStore');
    return useChatStore.getState().conversations
      .filter((c: any) => c.pinVerifier && !(Array.isArray(c.messages) && c.messages.length > 0)).length;
  } catch { return 0; }
}

export async function exportBackup(password?: string): Promise<string | null> {
  if (password !== undefined && password.length < 12) throw new Error('Encrypted backups require a password of at least 12 characters.');
  // Device-bound encrypted chats cannot be decrypted after transfer to a new
  // phone. Do not export legacy plaintext chat records into readable backups.
  const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
    k !== 'local-llm-chat-storage' && RESTORABLE_STORE_KEYS.has(k) && !EXCLUDED_BACKUP_KEYS.test(k));
  const pairs = await AsyncStorage.multiGet(keys);
  const safe = pairs.flatMap(([key, value]) => {
    if (value == null) return [];
    const sanitized = portableStoreValue(key, value);
    return sanitized == null ? [] : [[key, sanitized] as [string, string]];
  });
  if (password) {
    const { encryptedChatStorage } = require('../stores/encryptedChatStorage');
    const chatJson = await encryptedChatStorage.getItem('local-llm-chat-storage');
    if (chatJson) {
      const sanitized = portableStoreValue('local-llm-chat-storage', chatJson);
      if (sanitized) {
        // PIN-locked chats that are open right now (unlocked with their PIN) go into
        // the password-encrypted backup as normal chats marked wasLocked, so they can
        // move to a new phone. Chats still locked cannot be read and are left out.
        const parsed = JSON.parse(sanitized);
        parsed.state.conversations.push(...openLockedChats());
        safe.push(['local-llm-chat-storage', JSON.stringify(parsed)]);
      }
    }
  }
  const data = { format: MAGIC, version: 1, createdAt: new Date().toISOString(), items: Object.fromEntries(safe) };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = `OffGridAtlas-backup-${stamp}.${password ? 'atlasbackup' : 'json'}`;
  const path = `${RNFS.CachesDirectoryPath}/${name}`;
  const backupJson = JSON.stringify(data);
  // Protect memory/storage from accidentally exporting unbounded chat archives.
  // UTF-8 may occupy more bytes than the JavaScript string length.
  const bytes = unescape(encodeURIComponent(backupJson)).length;
  if (bytes > (password ? 35 : 50) * 1024 * 1024) {
    throw new Error('Backup exceeds 50 MB. Export fewer conversations or use a future encrypted archive format.');
  }
  const output = password ? await portableCrypto().encryptPortableBackup(backupJson, password) : backupJson;
  await RNFS.writeFile(path, output, 'utf8');
  try {
    const [res] = await saveDocuments({ sourceUris: [`file://${path}`], mimeType: password ? 'application/octet-stream' : 'application/json', fileName: name, copy: true });
    return res?.name ?? name;
  } finally {
    RNFS.unlink(path).catch(() => undefined);
  }
}

/** Returns the number of restored entries. The app must be closed and reopened afterwards. */
export async function importBackup(password?: string): Promise<number | null> {
  const files = await pick({ mode: 'open', type: [types.json, types.plainText, types.allFiles], allowMultiSelection: false });
  if (!files?.length) return null;
  const local = await resolvePickedFileUri(files[0].uri, files[0].name || 'backup.json');
  const pickedPath = local.replace(/^file:\/\//, '');
  const stat = await RNFS.stat(pickedPath);
  // Never parse unbounded attacker-controlled JSON into the app's memory.
  const backupBytes = Number(stat.size);
  if (!Number.isSafeInteger(backupBytes) || backupBytes < 0 || backupBytes > 50 * 1024 * 1024) {
    throw new Error('Backup size is invalid or exceeds the 50 MB import limit.');
  }
  const text = await RNFS.readFile(pickedPath, 'utf8');
  const encrypted = text.startsWith('atlasbackup:v1:');
  if (encrypted && !password) throw new Error('This encrypted backup requires its password.');
  if (!encrypted && password) throw new Error('Selected backup is not encrypted.');
  const decoded = encrypted ? await portableCrypto().decryptPortableBackup(text, password!) : text;
  const data = JSON.parse(decoded);
  if (data?.format !== MAGIC || data.version !== 1 || !data.items ||
      typeof data.items !== 'object' || Array.isArray(data.items)) {
    throw new Error('This is not a supported Atlas backup file.');
  }
  // A backup must not create arbitrary AsyncStorage keys or reintroduce secrets.
  const pairs = Object.entries(data.items).flatMap(([key, value]) => {
    if (!RESTORABLE_STORE_KEYS.has(key) || EXCLUDED_BACKUP_KEYS.test(key) || typeof value !== 'string') return [];
    const sanitized = portableStoreValue(key, value);
    return sanitized == null ? [] : [[key, sanitized] as [string, string]];
  });
  if (!pairs.length) throw new Error('No supported backup settings found. Only reviewed app stores are restorable; secrets and vault data are excluded.');
  const chatPair = pairs.find(([key]) => key === 'local-llm-chat-storage');
  const settingsPairs = pairs.filter(([key]) => key !== 'local-llm-chat-storage');
  if (chatPair && !encrypted) throw new Error('Chat restoration requires an encrypted backup.');
  // Restore via the selected-chat storage adapter. Ordinary chats are readable
  // on disk by design; protected chats must never enter a portable backup.
  if (chatPair) {
    const { encryptedChatStorage } = require('../stores/encryptedChatStorage');
    await encryptedChatStorage.setItem('local-llm-chat-storage', chatPair[1]);
  }
  if (settingsPairs.length) await AsyncStorage.multiSet(settingsPairs);
  // Load the restored data into the running app right away, so nothing writes old data back over it.
  const stores: [string, string][] = [
    ['../stores/chatStore', 'useChatStore'], ['../stores/remoteServerStore', 'useRemoteServerStore'], ['../stores/whisperStore', 'useWhisperStore'],
    ['../stores/appStore', 'useAppStore'], ['../stores/projectStore', 'useProjectStore'], ['../stores/agentStore', 'useAgentStore'],
    ['../atlasVoice/store', 'useAtlasVoiceStore'], ['../services/tools/webSearchProviders', 'useSearchSettings'], ['../atlasMaps/maps', 'useMaps'],
    ['../survival/store', 'useSurvivalStore'], ['./chatPrefs', 'useChatPrefs'], ['./offGrid', 'useOffGrid'], ['./offlineLibrary', 'useOfflineLibrary'],
    ['./lowPower', 'useLowPower'], ['../learning/store', 'useLearningStore'], ['../study/engine', 'useStudyStore'],
  ];
  const mods: Record<string, () => any> = {
    '../stores/chatStore': () => require('../stores/chatStore'), '../stores/remoteServerStore': () => require('../stores/remoteServerStore'),
    '../stores/whisperStore': () => require('../stores/whisperStore'), '../stores/appStore': () => require('../stores/appStore'),
    '../stores/projectStore': () => require('../stores/projectStore'), '../stores/agentStore': () => require('../stores/agentStore'),
    '../atlasVoice/store': () => require('../atlasVoice/store'), '../services/tools/webSearchProviders': () => require('../services/tools/webSearchProviders'),
    '../atlasMaps/maps': () => require('../atlasMaps/maps'), '../survival/store': () => require('../survival/store'),
    './chatPrefs': () => require('./chatPrefs'), './offGrid': () => require('./offGrid'), './offlineLibrary': () => require('./offlineLibrary'),
    './lowPower': () => require('./lowPower'), '../learning/store': () => require('../learning/store'), '../study/engine': () => require('../study/engine'),
  };
  for (const [m, name] of stores) {
    try { await mods[m]()[name]?.persist?.rehydrate?.(); } catch { /* store not present */ }
  }
  return pairs.length;
}
