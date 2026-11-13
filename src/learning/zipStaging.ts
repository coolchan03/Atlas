/**
 * Safe first step of importing a ZIP of textbooks and question banks: unpack into a scratch folder, check it, and list EVERY file with
 * what Atlas will do with it, so nothing is dropped silently. Nothing is added to a project here; the person reviews the list first.
 * Bounds are checked on what was unpacked (a bomb is removed straight away); the scratch folder is always removed afterwards.
 */
import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';

export const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
export const MAX_ENTRIES = 5000;
export const MAX_UNPACKED_BYTES = 3 * 1024 * 1024 * 1024;
export const MAX_RATIO = 200;

export type EntryKind = 'document' | 'questions' | 'archive' | 'unsupported' | 'unsafe';
export interface StagedEntry { name: string; path: string; size: number; kind: EntryKind; reason: string }
export interface StagedZip { dir: string; entries: StagedEntry[]; counts: Record<EntryKind, number> }

const DOCUMENT = /\.(pdf|epub|docx?|pptx?|xlsx?|odt|odp|ods|rtf|md|markdown|txt|html?)$/i;
const QUESTION_FILE = /\.(csv|json|tsv|txt|md)$/i;
const QUESTION_NAME = /question|quiz|exam|mcq|test.?bank|practice|answer/i;

/** What to do with one unpacked file. Pure. */
export function classifyEntry(name: string, size: number): { kind: EntryKind; reason: string } {
  const parts = name.replace(/\\/g, '/').split('/');
  if (parts.some((p) => p === '..' || p === '') || name.startsWith('/') || /%2e|%2f|%5c/i.test(name) || /[\u0000-\u001f]/.test(name)) return { kind: 'unsafe', reason: 'Its path tries to leave the folder, so it was not used.' };
  if (size <= 0) return { kind: 'unsupported', reason: 'The file is empty.' };
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return { kind: 'archive', reason: 'A zip inside the zip is not opened automatically. Add it on its own if you want it.' };
  if (QUESTION_FILE.test(name) && QUESTION_NAME.test(name)) return { kind: 'questions', reason: 'Looks like a question bank. You will review the questions before they are saved.' };
  if (DOCUMENT.test(name)) return { kind: 'document', reason: 'A book or notes. It will be added to the project for the tutor and practice.' };
  return { kind: 'unsupported', reason: 'Atlas cannot read this kind of file.' };
}

const emptyCounts = (): Record<EntryKind, number> => ({ document: 0, questions: 0, archive: 0, unsupported: 0, unsafe: 0 });

async function walk(dir: string, prefix: string, out: Array<{ name: string; path: string; size: number; link: boolean }>): Promise<void> {
  for (const it of await RNFS.readDir(dir)) {
    if (it.isDirectory()) await walk(it.path, `${prefix}${it.name}/`, out);
    else out.push({ name: `${prefix}${it.name}`, path: it.path, size: Number(it.size) || 0, link: false });
    if (out.length > MAX_ENTRIES + 1) return;
  }
}

/** Refusal reasons for an unpacked tree, or an empty list. Pure. */
export function boundsProblems(zipBytes: number, files: Array<{ size: number }>): string[] {
  const unpacked = files.reduce((n, f) => n + f.size, 0);
  const problems: string[] = [];
  if (files.length > MAX_ENTRIES) problems.push(`It holds more than ${MAX_ENTRIES} files.`);
  if (unpacked > MAX_UNPACKED_BYTES) problems.push('It unpacks to more than 3 GB.');
  if (zipBytes > 0 && unpacked / zipBytes > MAX_RATIO) problems.push('It is compressed far more than a real set of books would be.');
  return problems;
}

/** Unpacks and lists. Throws with the reasons when the zip is refused; the scratch folder never outlives a refusal. */
export async function stageZip(zipPath: string, scratchRoot = RNFS.CachesDirectoryPath): Promise<StagedZip> {
  const zipBytes = Number((await RNFS.stat(zipPath)).size) || 0;
  if (zipBytes > MAX_ZIP_BYTES) throw new Error('That zip is larger than 1 GB. Split it into smaller zips.');
  const dir = `${scratchRoot}/zip-import-${Date.now().toString(36)}`;
  await RNFS.mkdir(dir);
  try {
    await unzip(zipPath, dir);
    const files: Array<{ name: string; path: string; size: number; link: boolean }> = [];
    await walk(dir, '', files);
    const problems = boundsProblems(zipBytes, files);
    if (problems.length) throw new Error(`This zip was not opened. ${problems.join(' ')}`);
    const entries: StagedEntry[] = files.map((f) => ({ name: f.name, path: f.path, size: f.size, ...classifyEntry(f.name, f.size) }));
    const counts = emptyCounts();
    for (const e of entries) counts[e.kind]++;
    return { dir, entries, counts };
  } catch (e) {
    await RNFS.unlink(dir).catch(() => undefined);
    throw e;
  }
}

/** Removes the scratch folder. Call when the person has reviewed, whether or not they added anything. */
export const discardStage = (staged: StagedZip): Promise<void> => RNFS.unlink(staged.dir).catch(() => undefined);

/** One line the review screen shows, so the counts always add up to every file in the zip. */
export function summarizeStage(staged: StagedZip): string {
  const c = staged.counts; const total = staged.entries.length;
  const parts = [`${c.document} book${c.document === 1 ? '' : 's'} or document${c.document === 1 ? '' : 's'}`, `${c.questions} question file${c.questions === 1 ? '' : 's'}`];
  if (c.archive) parts.push(`${c.archive} zip${c.archive === 1 ? '' : 's'} inside (not opened)`);
  if (c.unsupported) parts.push(`${c.unsupported} not readable`);
  if (c.unsafe) parts.push(`${c.unsafe} refused for an unsafe path`);
  return `${total} file${total === 1 ? '' : 's'} in the zip: ${parts.join(', ')}.`;
}
