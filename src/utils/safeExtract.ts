/**
 * One safe way to unpack a zip: unpack, then check what came out (file count, total size, compression ratio, link-like or escaping
 * names). A zip that fails is removed straight away and the reason is thrown. Every importer uses this instead of calling unzip alone.
 */
import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { boundsProblems, classifyEntry, MAX_ENTRIES } from '../learning/zipStaging';

async function listAll(dir: string, prefix: string, out: Array<{ name: string; size: number }>): Promise<void> {
  for (const it of await RNFS.readDir(dir)) {
    // The relative name is built from entry names as the folders are walked, never cut out of a full path.
    if (it.isDirectory()) await listAll(it.path, `${prefix}${it.name}/`, out); else out.push({ name: `${prefix}${it.name}`, size: Number(it.size) || 0 });
    if (out.length > MAX_ENTRIES + 1) return;
  }
}

/** Reasons an unpacked tree is unsafe, or an empty list. */
export async function extractedProblems(zipPath: string, dir: string): Promise<string[]> {
  let zipBytes = 0;
  try { zipBytes = Number((await RNFS.stat(zipPath)).size) || 0; } catch { /* size unknown: the ratio check is skipped, the other limits still apply */ }
  const files: Array<{ name: string; size: number }> = [];
  await listAll(dir, '', files);
  const problems = boundsProblems(zipBytes, files);
  if (files.some((f) => classifyEntry(f.name, Math.max(1, f.size)).kind === 'unsafe')) problems.push('A file name tries to leave the folder.');
  return problems;
}

/** Unpacks `zipPath` into `dir`. Throws, and removes `dir`, when the result is unsafe. */
export async function safeUnzip(zipPath: string, dir: string): Promise<void> {
  await unzip(zipPath, dir);
  const problems = await extractedProblems(zipPath, dir);
  if (problems.length) {
    await RNFS.unlink(dir).catch(() => undefined);
    throw new Error(`That zip was not used. ${problems.join(' ')}`);
  }
}
