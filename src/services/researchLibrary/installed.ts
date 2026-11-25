import RNFS from 'react-native-fs';
import { open } from '@op-engineering/op-sqlite';
import { LibraryQueries, type LibraryDb } from './db';
import { profileFor, registerProfile } from './profile';
import { legalUsProfile } from './profiles/legalUs';
import type { LibraryContext } from './operations';
import type { InstalledLibrary } from './types';
import { useResearchLibraryStore } from '../../stores/researchLibraryStore';

registerProfile(legalUsProfile);

const contexts = new Map<string, LibraryContext>();

const join = (dir: string, rel: string): string => `${dir.replace(/\/$/, '')}/${rel}`;
/** A path inside the library's folder, or an error: a document's recorded path can never point outside the library. */
export function insideLibrary(dir: string, rel: string): string {
  const parts = rel.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (parts.includes('..') || /^[A-Za-z]:|^\//.test(rel)) throw new Error('A document path points outside its library.');
  return join(dir, parts.join('/'));
}

/** Bytes [start, end) of a file, read from disk without loading the file. Decoded as UTF-8 (offsets that cut a character give a replacement mark, not an error). */
export async function readBytes(file: string, start: number, end: number): Promise<string> {
  const length = Math.max(0, end - start);
  if (!length) return '';
  const b64 = await RNFS.read(file, length, start, 'base64');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function dbFor(lib: InstalledLibrary): LibraryDb {
  const full = insideLibrary(lib.dir, lib.manifest.database);
  const slash = full.lastIndexOf('/');
  const db = open({ name: full.slice(slash + 1), location: full.slice(0, slash) });
  return { all: async (sql, params = []) => ((await db.execute(sql, params as any[])).rows ?? []) as Array<Record<string, unknown>> };
}

/** Opens an installed library (once, then cached). The database is only ever read. */
export function openLibrary(id: string): LibraryContext | null {
  const cached = contexts.get(id);
  if (cached) return cached;
  const lib = useResearchLibraryStore.getState().get(id);
  if (!lib) return null;
  const sources = lib.manifest.sourcesDir ?? '';
  const ctx: LibraryContext = {
    id, manifest: lib.manifest, queries: new LibraryQueries(dbFor(lib), lib.manifest), profile: profileFor(lib.manifest.profile),
    readSource: (path, start, end) => readBytes(insideLibrary(lib.dir, sources ? `${sources}/${path}` : path), start, end),
  };
  contexts.set(id, ctx);
  return ctx;
}
export const closeLibrary = (id: string): void => { contexts.delete(id); };

/** The opened libraries a project uses. */
export function librariesForProject(libraryIds: string[] | undefined): LibraryContext[] {
  return (libraryIds ?? []).map(openLibrary).filter((c): c is LibraryContext => !!c);
}
