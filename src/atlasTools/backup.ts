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

export async function exportBackup(): Promise<string | null> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => !/auth|passphrase|lock/i.test(k));
  const pairs = await AsyncStorage.multiGet(keys);
  const data = { format: MAGIC, version: 1, createdAt: new Date().toISOString(), items: Object.fromEntries(pairs) };
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
  const text = await RNFS.readFile(local.replace(/^file:\/\//, ''), 'utf8');
  const data = JSON.parse(text);
  if (data?.format !== MAGIC || typeof data.items !== 'object') throw new Error('This is not an Atlas backup file.');
  const pairs = Object.entries(data.items).filter(([, v]) => typeof v === 'string') as [string, string][];
  await AsyncStorage.multiSet(pairs);
  return pairs.length;
}
