import { safeUnzip } from '../utils/safeExtract';
import RNFS from 'react-native-fs';
import { pick, types } from '@react-native-documents/picker';
import { resolvePickedFileUri } from '../utils/resolvePickedFileUri';
import { limitResources, parseSkill, SkillFormatError, type ParsedSkill, type SkillResource } from './parseSkill';

/** A skill is instructions: anything bigger than this is not one. */
const MAX_BYTES = 200 * 1024;

/** The shallowest SKILL.md in an unzipped folder. */
async function findSkillFile(dir: string, depth = 0): Promise<string | null> {
  const entries = await RNFS.readDir(dir);
  const here = entries.find((e) => e.isFile() && e.name.toLowerCase() === 'skill.md');
  if (here) return here.path;
  if (depth >= 3) return null;
  for (const e of entries.filter((x) => x.isDirectory() && !x.name.startsWith('.') && x.name !== '__MACOSX')) {
    const found = await findSkillFile(e.path, depth + 1);
    if (found) return found;
  }
  return null;
}

async function readText(path: string): Promise<string> {
  const stat = await RNFS.stat(path);
  if (Number(stat.size) > MAX_BYTES) throw new SkillFormatError('That file is too big to be a skill (over 200 KB). A skill is a short set of instructions.');
  return RNFS.readFile(path, 'utf8');
}

/** Every text file under the skill's folder (not SKILL.md itself), with its path relative to the folder; the files that are too big are not read. */
async function readResources(dir: string, root = dir, depth = 0): Promise<SkillResource[]> {
  const out: SkillResource[] = [];
  for (const e of await RNFS.readDir(dir)) {
    if (e.name.startsWith('.') || e.name === '__MACOSX') continue;
    if (e.isDirectory() && depth < 3) out.push(...await readResources(e.path, root, depth + 1));
    else if (e.isFile() && Number(e.size) <= 40 * 1024 && !/^skill\.md$/i.test(e.name)) {
      try { out.push({ name: e.path.slice(root.length + 1), text: await RNFS.readFile(e.path, 'utf8') }); } catch { /* not text: left out */ }
    }
  }
  return out;
}

/** The skill in a picked SKILL.md (or any .md / .txt) file, or in a zipped skill folder with the text files that sit with it. Scripts are not run. */
async function readSkillFile(uri: string, name: string): Promise<ParsedSkill> {
  const local = (await resolvePickedFileUri(uri, name || 'skill.md')).replace(/^file:\/\//, '');
  if (!/\.zip$/i.test(name)) return parseSkill(await readText(local));
  const dir = `${RNFS.CachesDirectoryPath}/skill-import-${Date.now()}`;
  try {
    await safeUnzip(local, dir);
    const found = await findSkillFile(dir);
    if (!found) throw new SkillFormatError('There is no SKILL.md in that zip.');
    const skill = parseSkill(await readText(found));
    const { kept } = limitResources(await readResources(found.slice(0, found.lastIndexOf('/'))));
    return kept.length ? { ...skill, resources: kept } : skill;
  } finally {
    RNFS.unlink(dir).catch(() => undefined);
  }
}

/**
 * Opens the file picker and reads the chosen skill; null when the person closes the picker. Several files can be chosen at once: the one with
 * a skill header is the skill and the other text files come with it as its references.
 */
export async function pickSkill(): Promise<ParsedSkill | null> {
  let files;
  try { files = await pick({ mode: 'open', type: [types.allFiles], allowMultiSelection: true }); } catch { return null; }
  if (!files?.length) return null;
  if (files.length === 1) return readSkillFile(files[0].uri, files[0].name || 'skill.md');
  const read = await Promise.all(files.map(async (f) => {
    const local = (await resolvePickedFileUri(f.uri, f.name || 'file.txt')).replace(/^file:\/\//, '');
    return { name: f.name || 'file.txt', text: await readText(local) };
  }));
  const main = read.find((f) => /^skill\.md$/i.test(f.name)) ?? read.find((f) => /^---\n/.test(f.text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n')));
  if (!main) throw new SkillFormatError('None of those files is a SKILL.md (a file that starts with a header between two --- lines).');
  const { kept } = limitResources(read.filter((f) => f !== main));
  const skill = parseSkill(main.text);
  return kept.length ? { ...skill, resources: kept } : skill;
}
