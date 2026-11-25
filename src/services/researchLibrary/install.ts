import RNFS from 'react-native-fs';
import { pick, types } from '@react-native-documents/picker';
import { safeUnzip } from '../../utils/safeExtract';
import { resolvePickedFileUri } from '../../utils/resolvePickedFileUri';
import { fileProblems, parseManifest } from './manifest';
import { LibraryQueries } from './db';
import { closeLibrary } from './installed';
import { MANIFEST_FILE, type InstalledLibrary, type LibraryManifest } from './types';
import { useResearchLibraryStore } from '../../stores/researchLibraryStore';
import { open } from '@op-engineering/op-sqlite';

export const LIBRARIES_DIR = `${RNFS.DocumentDirectoryPath}/research_libraries`;

async function sizeOf(dir: string): Promise<number> {
  let total = 0;
  for (const it of await RNFS.readDir(dir)) total += it.isDirectory() ? await sizeOf(it.path) : Number(it.size) || 0;
  return total;
}
async function listFiles(dir: string, base = dir, out: Array<{ path: string; size: number }> = []) {
  for (const it of await RNFS.readDir(dir)) {
    if (it.isDirectory()) await listFiles(it.path, base, out);
    else out.push({ path: it.path.slice(base.length + 1), size: Number(it.size) || 0 });
  }
  return out;
}
/** The folder that holds the manifest: the unpacked root, or the single folder a zip usually wraps everything in. */
async function findRoot(dir: string): Promise<string | null> {
  if (await RNFS.exists(`${dir}/${MANIFEST_FILE}`)) return dir;
  const inner = (await RNFS.readDir(dir)).filter((i) => i.isDirectory());
  return inner.length === 1 && await RNFS.exists(`${inner[0].path}/${MANIFEST_FILE}`) ? inner[0].path : null;
}

/** Checks an unpacked library before it is kept: the manifest, a complete copy, and a database that has what the manifest says. */
export async function verifyLibraryFolder(root: string): Promise<{ manifest: LibraryManifest } | { problems: string[] }> {
  let raw: unknown;
  try { raw = JSON.parse(await RNFS.readFile(`${root}/${MANIFEST_FILE}`, 'utf8')); } catch { return { problems: [`${MANIFEST_FILE} is missing or is not valid JSON`] }; }
  const parsed = parseManifest(raw);
  if ('problems' in parsed) return parsed;
  const { manifest } = parsed;
  const problems = fileProblems(manifest, await listFiles(root));
  if (!(await RNFS.exists(`${root}/${manifest.database}`))) problems.push(`${manifest.database} is missing`);
  if (problems.length) return { problems };
  const slash = `${root}/${manifest.database}`.lastIndexOf('/');
  const full = `${root}/${manifest.database}`;
  const db = open({ name: full.slice(slash + 1), location: full.slice(0, slash) });
  try {
    const missing = await new LibraryQueries({ all: async (sql, p = []) => ((await db.execute(sql, p as any[])).rows ?? []) as any[] }, manifest).missingParts();
    if (missing.length) return { problems: [`the database has no ${missing.join(', ')}`] };
  } catch (e: any) { return { problems: [`the database cannot be read (${String(e?.message || e).slice(0, 80)})`] }; }
  finally { try { db.close(); } catch { /* already closed */ } }
  return { manifest };
}

/** Installs a library from a folder already on the device (unpacked). Replaces an installed library with the same id. */
export async function installLibraryFolder(root: string): Promise<InstalledLibrary> {
  const checked = await verifyLibraryFolder(root);
  if ('problems' in checked) throw new Error(`This is not a usable research library: ${checked.problems.slice(0, 4).join('; ')}.`);
  const { manifest } = checked;
  const target = `${LIBRARIES_DIR}/${manifest.id}`;
  closeLibrary(manifest.id);
  if (root !== target) {
    await RNFS.mkdir(LIBRARIES_DIR);
    if (await RNFS.exists(target)) await RNFS.unlink(target);
    await RNFS.moveFile(root, target);
  }
  const lib: InstalledLibrary = { id: manifest.id, name: manifest.name, version: manifest.version, profile: manifest.profile ?? 'generic', dir: target, sizeBytes: await sizeOf(target), installedAt: new Date().toISOString(), manifest };
  useResearchLibraryStore.getState().upsert(lib);
  return lib;
}

/** Pick a .zip of a library, unpack it inside the app, check it, install it. A cut-short or wrong zip is rejected before anything is kept. */
export async function importLibraryZip(onProgress: (msg: string) => void): Promise<InstalledLibrary | null> {
  const files = await pick({ mode: 'open', type: [types.allFiles], allowMultiSelection: false });
  if (!files?.length) return null;
  const f = files[0];
  if (!/\.zip$/i.test(f.name || '')) throw new Error(`"${f.name || 'That file'}" does not end in .zip. Pick the library's .zip file.`);
  onProgress('Copying the library...');
  const local = await resolvePickedFileUri(f.uri, f.name || 'library.zip');
  const staging = `${RNFS.CachesDirectoryPath}/library_staging_${Date.now()}`;
  try {
    await RNFS.mkdir(staging);
    onProgress('Unpacking...');
    await safeUnzip(local.replace(/^file:\/\//, ''), staging);
    const root = await findRoot(staging);
    if (!root) throw new Error(`There is no ${MANIFEST_FILE} in this zip, so it is not a research library.`);
    onProgress('Checking...');
    return await installLibraryFolder(root);
  } finally {
    try { await RNFS.unlink(local.replace(/^file:\/\//, '')); } catch { /* copy may be the original */ }
    try { await RNFS.unlink(staging); } catch { /* moved */ }
  }
}

export async function removeLibrary(id: string): Promise<void> {
  const lib = useResearchLibraryStore.getState().get(id);
  closeLibrary(id);
  if (lib) { try { await RNFS.unlink(lib.dir); } catch { /* already gone */ } }
  useResearchLibraryStore.getState().remove(id);
}
