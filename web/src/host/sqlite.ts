// SQLite (with FTS5) for the web build: the official sqlite-wasm build, held in memory and saved to the
// virtual file system. op-sqlite's open() is synchronous, so the WASM module and the saved database files
// are loaded once at start-up (prepareSqlite) and open() then works without awaiting anything.
import { fs } from './fs';

const DIR = '/atlas/db';
let sqlite3: any = null;
const saved = new Map<string, Uint8Array>();
const dirty = new Map<string, any>();
let timer: ReturnType<typeof setTimeout> | null = null;
let ready: Promise<void> | null = null;

export function prepareSqlite(): Promise<void> {
  return (ready ??= (async () => {
    const mod = await import('@sqlite.org/sqlite-wasm');
    sqlite3 = await (mod as any).default({ print: () => undefined, printErr: () => undefined });
    try {
      for (const e of await fs().readdir(DIR)) if (e.isFile && e.name.endsWith('.sqlite')) saved.set(e.name.slice(0, -7), await fs().readFile(e.path));
    } catch { /* first run: nothing saved yet */ }
    const flush = () => void flushAll();
    addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    addEventListener('pagehide', flush);
  })());
}

export async function flushAll() {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const [name, db] of [...dirty]) {
    dirty.delete(name);
    try {
      const bytes: Uint8Array = sqlite3.capi.sqlite3_js_db_export(db.pointer);
      await fs().mkdir(DIR);
      await fs().writeFile(`${DIR}/${name}.sqlite`, bytes);
    } catch (e) {
      console.warn('[sqlite] could not save', name, e);
    }
  }
}
const markDirty = (name: string, db: any) => {
  dirty.set(name, db);
  timer ??= setTimeout(() => void flushAll(), 800);
};

const WRITE = /^\s*(insert|update|delete|replace|create|drop|alter|pragma\s+user_version|vacuum|commit|end)\b/i;

export function openDatabase(name: string) {
  if (!sqlite3) throw new Error('SQLite is not ready yet (prepareSqlite was not awaited)');
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  const bytes = saved.get(name);
  if (bytes) {
    const p = sqlite3.wasm.allocFromTypedArray(bytes);
    const rc = sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.length, bytes.length, sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE);
    if (rc) throw new Error(`Could not load the saved database ${name} (${rc})`);
  }
  const exec = (sql: string, params?: unknown[]) => {
    const binds = (params ?? []).map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v === undefined ? null : v)) as any[];
    const rows: Record<string, unknown>[] = db.exec({ sql, bind: binds.length ? binds : undefined, rowMode: 'object', returnValue: 'resultRows' });
    for (const r of rows) for (const k of Object.keys(r)) if (r[k] instanceof Uint8Array) r[k] = (r[k] as Uint8Array).slice().buffer;
    if (WRITE.test(sql)) markDirty(name, db);
    return {
      rows,
      insertId: /^\s*(insert|replace)/i.test(sql) ? Number(sqlite3.capi.sqlite3_last_insert_rowid(db.pointer)) : undefined,
      rowsAffected: db.changes(),
    };
  };
  return {
    executeSync: exec,
    execute: async (sql: string, params?: unknown[]) => exec(sql, params),
    executeBatch: async (cmds: [string, unknown[]?][]) => { for (const [s, p] of cmds) exec(s, p); return { rowsAffected: 0 }; },
    transaction: async (fn: (tx: any) => Promise<void>) => {
      exec('BEGIN');
      try { await fn({ execute: async (s: string, p?: unknown[]) => exec(s, p) }); exec('COMMIT'); } catch (e) { exec('ROLLBACK'); throw e; }
    },
    close: () => { void flushAll().then(() => db.close()); },
    delete: () => { dirty.delete(name); saved.delete(name); void fs().unlink(`${DIR}/${name}.sqlite`).catch(() => undefined); db.close(); },
    flush: () => flushAll(),
  };
}
