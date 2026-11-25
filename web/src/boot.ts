// Everything that must be ready before the first React render.
import { prepareSqlite } from './host/sqlite';
import { fs } from './host/fs';

export async function boot() {
  try {
    // Ask the browser not to evict our storage (models, library packs, chats are all in it).
    void navigator.storage?.persist?.();
  } catch { /* optional */ }
  await Promise.all([prepareSqlite().catch((e) => console.warn('[boot] sqlite', e)), fs().mkdir('/atlas/files').catch(() => undefined)]);
}

// Debug / test hook (also used by scripts/smoke checks).
import { openDatabase } from './host/sqlite';
import * as rnfs from './shims/react-native-fs';
import { NativeModules, bus } from './native/registry';
(globalThis as any).__atlas = { fs, openDatabase, rnfs, NativeModules, bus, llama: () => import('./shims/llama-rn'), whisper: () => import('./shims/whisper-rn') };
