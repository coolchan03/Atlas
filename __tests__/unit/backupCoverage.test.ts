/** A new persisted store cannot be forgotten: it is backed up, synced by its own code, or listed with the reason it is left out. */
import fs from 'fs';
import path from 'path';
import { RESTORABLE_STORE_KEYS, NOT_BACKED_UP } from '../../src/atlasTools/backupKeys';
import { persistedStoreKeys } from '../../src/atlasTools/storeRegistry';

function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

it('every persisted store is backed up or has a reason it is not', () => {
  const keys = new Set<string>();
  for (const file of sources(path.join(__dirname, '../../src'))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/name:\s*'(atlas-[a-z0-9-]+|remote-servers)'/g)) keys.add(m[1]);
  }
  const missing = [...keys].filter((k) => !RESTORABLE_STORE_KEYS.has(k) && !(k in NOT_BACKED_UP));
  expect(missing).toEqual([]);
});

it('every backed-up store can be loaded into the running app after a restore', () => {
  const registry = new Set(persistedStoreKeys());
  const own = new Set(['local-llm-chat-storage', 'local-llm-project-storage']);
  expect([...RESTORABLE_STORE_KEYS].filter((k) => !registry.has(k) && !own.has(k))).toEqual([]);
});
