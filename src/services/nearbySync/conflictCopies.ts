/**
 * When syncing replaces this phone's copy of a store with the other phone's newer copy (the stores that cannot be merged item by item),
 * the replaced copy is kept here for a while, so an edit made on this phone is never silently lost. The person can put it back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rehydrateStores } from '../../atlasTools/storeRegistry';

const KEY = 'atlas-sync-conflicts';
const KEEP_PER_STORE = 3;
const KEEP_DAYS = 14;
export interface ConflictCopy { id: string; key: string; value: string; replacedAt: number }

async function read(): Promise<ConflictCopy[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'); } catch { return []; }
}
const write = (items: ConflictCopy[]) => AsyncStorage.setItem(KEY, JSON.stringify(items));

/** Keeps this phone's copy of `key` before it is replaced. The newest few per store are kept, for two weeks. */
export async function keepConflictCopy(key: string, value: string, now = Date.now()): Promise<void> {
  const fresh = (await read()).filter((c) => now - c.replacedAt < KEEP_DAYS * 86400000);
  const mine = [{ id: `${key}@${now}`, key, value, replacedAt: now }, ...fresh.filter((c) => c.key === key)].slice(0, KEEP_PER_STORE);
  await write([...mine, ...fresh.filter((c) => c.key !== key)]);
}

export const listConflictCopies = async (): Promise<ConflictCopy[]> => (await read()).sort((a, b) => b.replacedAt - a.replacedAt);

/** Puts a kept copy back as this phone's store. The copy that is replaced in turn is kept, so this can be undone too. */
export async function restoreConflictCopy(id: string): Promise<boolean> {
  const items = await read();
  const copy = items.find((c) => c.id === id);
  if (!copy) return false;
  const current = await AsyncStorage.getItem(copy.key);
  await AsyncStorage.setItem(copy.key, copy.value);
  await write(items.filter((c) => c.id !== id));
  if (current) await keepConflictCopy(copy.key, current);
  await rehydrateStores([copy.key]);
  return true;
}
