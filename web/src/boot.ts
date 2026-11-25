// Everything that must be ready before the first React render.
import { prepareSqlite } from './host/sqlite';
import { fs } from './host/fs';

export async function boot() {
  try {
    // Ask the browser not to evict our storage (models, library packs, chats are all in it).
    void navigator.storage?.persist?.();
  } catch { /* optional */ }
  try { (globalThis as any).__atlasSys = await (globalThis as any).atlasHost?.system?.(); } catch { /* browser */ }
  await Promise.all([prepareSqlite().catch((e) => console.warn('[boot] sqlite', e)), fs().mkdir('/atlas/files').catch(() => undefined)]);
}

// Debug / test hook (also used by scripts/smoke checks).
import { openDatabase } from './host/sqlite';
import * as rnfs from './shims/react-native-fs';
import { NativeModules, bus } from './native/registry';
(globalThis as any).__atlas = { fs, openDatabase, rnfs, NativeModules, bus, llama: () => import('./shims/llama-rn'), whisper: () => import('./shims/whisper-rn') };

// ?trace in the URL logs every native-module call that starts and whether it ever finishes (finds hung awaits).
if (typeof location !== 'undefined' && location.search.includes('trace')) {
  const pending = new Map<number, string>();
  let n = 0;
  (globalThis as any).__pending = () => [...pending.values()];
  const wrap = (obj: any, prefix: string) => {
    for (const k of Object.keys(obj)) {
      const f = obj[k];
      if (typeof f !== 'function') continue;
      obj[k] = (...a: any[]) => {
        const id = ++n;
        pending.set(id, `${prefix}.${k}(${a.map((x) => (typeof x === 'string' ? x.slice(0, 40) : typeof x)).join(',')})`);
        const r = f.apply(obj, a);
        if (r && typeof r.then === 'function') r.then(() => pending.delete(id), () => pending.delete(id));
        else pending.delete(id);
        return r;
      };
    }
  };
  for (const [name, mod] of Object.entries(NativeModules)) wrap(mod, name);
  wrap((rnfs as any).default, 'RNFS');
}
