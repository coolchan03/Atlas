import { safeUnzip } from '../utils/safeExtract';
import RNFS from 'react-native-fs';
import { pick, types } from '@react-native-documents/picker';
import { resolvePickedFileUri } from '../utils/resolvePickedFileUri';
import { ragService } from '../services/rag';
import logger from '../utils/logger';

const TEXT = /\.(md|txt|markdown|csv|json|html?)$/i;
/** Books and office files: read by the document reader like any file added to a project, so a zip of PDFs and Word files works too. */
const DOCUMENT = /\.(pdf|docx?|pptx?|xlsx?|epub|odt|odp|ods|rtf)$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

/** A package saved to a drive lists its packs and their sizes here, so a copy that was cut short can be caught before anything is added. */
export const MANIFEST_NAME = 'atlas-manifest.json';
export interface PackManifest { tier?: string; created?: string; packs: Array<{ name: string; size: number }> }

/** Packs of a manifest that are missing or the wrong size. Pure, so it is tested without a device. */
export function manifestProblems(manifest: PackManifest, found: Array<{ name: string; size: number }>): string[] {
  return manifest.packs.flatMap((p) => {
    const f = found.find((x) => x.name === p.name);
    if (!f) return [`${p.name} is missing`];
    return f.size === p.size ? [] : [`${p.name} is ${f.size < p.size ? 'cut short' : 'the wrong size'} (${f.size} of ${p.size} bytes)`];
  });
}

export interface PackResult { added: number; skipped: number; failed: { name: string; error: string }[]; total: number; /** Files in the zip that were not added because Atlas cannot read that kind of file (pictures, videos and so on). */ ignored: string[] }

/** Text files to add, and any zips inside the unpacked folder (a package bundle holds one zip per subject pack). */
async function walk(dir: string, found: { items: any[]; zips: any[]; ignored: string[] } = { items: [], zips: [], ignored: [] }): Promise<{ items: any[]; zips: any[]; ignored: string[] }> {
  for (const it of await RNFS.readDir(dir)) {
    if (it.isDirectory()) await walk(it.path, found);
    else if (it.name === MANIFEST_NAME) continue;
    else if (TEXT.test(it.name) || DOCUMENT.test(it.name)) found.items.push(it);
    else if (/\.zip$/i.test(it.name)) found.zips.push(it);
    else found.ignored.push(it.name);
  }
  return found;
}

/**
 * Pick a .zip of Atlas text files (for example the PC script's OffGrid_Parts packs),
 * unpack it inside the app and add every text file, PDF, Word, PowerPoint, Excel and EPUB file to the project's knowledge base.
 * Files already in the knowledge base are skipped, so it is safe to import again.
 */
export async function importZipPack(projectId: string, onProgress: (msg: string) => void, shouldStop: () => boolean = () => false): Promise<PackResult | null> {
  // Every file is offered and the name checked after: phones label a .zip with different types, and a type filter greys some of them out.
  const files = await pick({ mode: 'open', type: [types.allFiles], allowMultiSelection: false });
  if (!files?.length) return null;
  const f = files[0];
  if (!/\.zip$/i.test(f.name || '')) throw new Error(`"${f.name || 'That file'}" does not end in .zip. Pick a .zip file.`);
  onProgress('Copying the pack...');
  const local = await resolvePickedFileUri(f.uri, f.name || 'atlas-pack.zip');
  const res = await importZipFromPath(projectId, { path: local, name: f.name || 'pack.zip' }, { onProgress, shouldStop });
  try { await RNFS.unlink(local.replace(/^file:\/\//, '')); } catch { /* copy may be the original */ }
  return res;
}

/** Unpack a .zip that is already on the phone and add its text files, books and office files to the project's knowledge base. */
export async function importZipFromPath(projectId: string, file: { path: string; name: string }, hooks: { onProgress: (msg: string) => void; shouldStop?: () => boolean }): Promise<PackResult> {
  const { path: local, name } = file;
  const { onProgress, shouldStop = () => false } = hooks;
  const target = `${RNFS.DocumentDirectoryPath}/atlas_packs/${name.replace(/\.zip$/i, '').replace(/[^A-Za-z0-9._-]/g, '_')}`;
  await RNFS.mkdir(target);
  onProgress('Unpacking...');
  try { await safeUnzip(local.replace(/^file:\/\//, ''), target); } catch (e: any) {
    throw new Error(`${name} could not be unpacked. The file may be incomplete (a copy that was cut off). Copy it again from the original. (${String(e?.message || e).slice(0, 80)})`);
  }
  const { items, zips, ignored } = await walk(target);
  // A package from a drive says what it should contain: check that before adding anything.
  if (await RNFS.exists(`${target}/${MANIFEST_NAME}`)) {
    const manifest: PackManifest = JSON.parse(await RNFS.readFile(`${target}/${MANIFEST_NAME}`, 'utf8'));
    const problems = manifestProblems(manifest, zips.map((z) => ({ name: z.name, size: Number(z.size) })));
    if (problems.length) throw new Error(`This package is incomplete, so nothing was added: ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? '...' : ''}. Copy it again from the original.`);
  }
  const res: PackResult = { added: 0, skipped: 0, failed: [], total: items.length, ignored };
  // An Atlas package saved to a drive is one zip of subject packs: add each pack in turn.
  for (const z of zips) {
    if (shouldStop()) break;
    const inner = await importZipFromPath(projectId, { path: z.path, name: z.name }, { onProgress, shouldStop });
    res.added += inner.added; res.skipped += inner.skipped; res.total += inner.total; res.failed.push(...inner.failed); res.ignored.push(...inner.ignored);
  }
  for (let i = 0; i < items.length; i++) {
    if (shouldStop()) break;
    const it = items[i];
    onProgress(`Adding ${i + 1} of ${items.length}: ${it.name}`);
    const limit = DOCUMENT.test(it.name) ? MAX_DOCUMENT_BYTES : MAX_BYTES;
    if (Number(it.size) > limit) { res.failed.push({ name: it.name, error: `larger than ${limit / (1024 * 1024)} MB` }); continue; }
    try {
      await ragService.indexDocument({ projectId, filePath: it.path, fileName: it.name, fileSize: Number(it.size) || 0 });
      res.added++;
    } catch (e: any) {
      const m = String(e?.message || e);
      if (/already in the knowledge base/.test(m)) res.skipped++;
      else { res.failed.push({ name: it.name, error: m.slice(0, 120) }); logger.warn(`[AtlasPack] ${it.name}: ${m}`); }
    }
  }
  return res;
}
