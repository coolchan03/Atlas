import AsyncStorage from '@react-native-async-storage/async-storage';
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

export async function exportBackup(): Promise<string | null> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
    RESTORABLE_STORE_KEYS.has(k) && !EXCLUDED_BACKUP_KEYS.test(k));
  const pairs = await AsyncStorage.multiGet(keys);
  const safe = pairs.flatMap(([key, value]) => {
    if (value == null) return [];
    const sanitized = sanitizeBackupValue(value);
    return sanitized == null ? [] : [[key, sanitized] as [string, string]];
  });
  const data = { format: MAGIC, version: 1, createdAt: new Date().toISOString(), items: Object.fromEntries(safe) };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = `OffGridAtlas-backup-${stamp}.json`;
  const path = `${RNFS.CachesDirectoryPath}/${name}`;
  await RNFS.writeFile(path, JSON.stringify(data), 'utf8');
  try {
    const [res] = await saveDocuments({ sourceUris: [`file://${path}`], mimeType: 'application/json', fileName: name, copy: true });
    return res?.name ?? name;
  } finally {
    RNFS.unlink(path).catch(() => undefined);
  }
}

/** Returns the number of restored entries. The app must be closed and reopened afterwards. */
export async function importBackup(): Promise<number | null> {
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
  const data = JSON.parse(text);
  if (data?.format !== MAGIC || data.version !== 1 || !data.items ||
      typeof data.items !== 'object' || Array.isArray(data.items)) {
    throw new Error('This is not a supported Atlas backup file.');
  }
  // A backup must not create arbitrary AsyncStorage keys or reintroduce secrets.
  const pairs = Object.entries(data.items).flatMap(([key, value]) => {
    if (!RESTORABLE_STORE_KEYS.has(key) || EXCLUDED_BACKUP_KEYS.test(key) || typeof value !== 'string') return [];
    const sanitized = sanitizeBackupValue(value);
    return sanitized == null ? [] : [[key, sanitized] as [string, string]];
  });
  if (!pairs.length) throw new Error('No supported backup settings found. Only reviewed app stores are restorable; secrets and vault data are excluded.');
  await AsyncStorage.multiSet(pairs);
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
