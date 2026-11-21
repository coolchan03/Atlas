/** The file side of the project bundle: write a folder, zip it, let the person save it; and pick a zip, check it, unpack it, merge it. */
import RNFS from 'react-native-fs';
import { zip, unzip } from 'react-native-zip-archive';
import { saveDocuments, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { resolvePickedFileUri } from '../utils/resolvePickedFileUri';
import { applyProjectBundle, writeProjectBundle, type BundleManifest, type BundleResult } from './projectBundle';
import { directoryProblems, MAX_ENTRIES } from './zipStaging';
import { readZipDirectory } from './zipDirectory';

const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;

/** Makes the ZIP of one project and offers it to be saved. Returns the saved name and what is in it, or null when the person did not save it. */
export async function exportProjectZip(projectId: string): Promise<{ name: string; manifest: BundleManifest } | null> {
  const scratch = `${RNFS.CachesDirectoryPath}/project-bundle-${Date.now().toString(36)}`;
  await RNFS.mkdir(scratch);
  const target = `${scratch}.zip`;
  try {
    const manifest = await writeProjectBundle(projectId, scratch);
    await zip(scratch, target);
    const safe = manifest.project.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'project';
    const name = `Atlas-project-${safe}-${new Date().toISOString().slice(0, 10)}.zip`;
    let saved: { name?: string | null } | undefined;
    try { [saved] = await saveDocuments({ sourceUris: [`file://${target}`], mimeType: 'application/zip', fileName: name, copy: true }); }
    catch (e) { if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null; throw e; } // backing out of the save sheet is not an error
    return saved ? { name: saved.name ?? name, manifest } : null;
  } finally {
    await RNFS.unlink(scratch).catch(() => undefined);
    await RNFS.unlink(target).catch(() => undefined);
  }
}

/** Opens a project ZIP the person picked: its list of files is checked before anything is unpacked, then every file against its checksum. */
export async function importProjectZip(pickedUri: string, pickedName: string): Promise<BundleResult> {
  const path = await resolvePickedFileUri(pickedUri, pickedName || 'project.zip');
  const bytes = Number((await RNFS.stat(path)).size) || 0;
  if (bytes > MAX_ZIP_BYTES) throw new Error('That zip is larger than 2 GB.');
  const listed = await readZipDirectory(path, bytes, MAX_ENTRIES);
  const early = directoryProblems(bytes, listed);
  if (early.length) throw new Error(`This zip was not opened. ${early.join(' ')}`);
  const dir = `${RNFS.CachesDirectoryPath}/project-import-${Date.now().toString(36)}`;
  await RNFS.mkdir(dir);
  try {
    await unzip(path, dir);
    return await applyProjectBundle(dir);
  } finally { await RNFS.unlink(dir).catch(() => undefined); }
}
