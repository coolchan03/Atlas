import RNFS from 'react-native-fs';
import * as DT from '../../atlasTools/deviceTools';

export interface CodeProjectFile { path: string; content: string }
const MAX_FILES = 20;
const MAX_TOTAL = 120000;

/** Validates file names before touching the filesystem; never executes generated code. */
export function parseCodeFiles(filesJson: string): CodeProjectFile[] {
  let parsed: unknown;
  try { parsed = JSON.parse(filesJson); }
  catch { throw new Error('files_json must be a JSON array of {path, content} objects.'); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_FILES) {
    throw new Error('Provide between 1 and 20 source files.');
  }
  let total = 0;
  const names = new Set<string>();
  return parsed.map((entry: any) => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.content !== 'string') {
      throw new Error('Every file must have a path and UTF-8 content.');
    }
    const name = entry.path.replace(/\\/g, '/');
    const parts = name.split('/');
    if (name.length > 180 || name.startsWith('/') ||
        parts.some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git') ||
        /[\x00-\x1f<>:"|?*]/.test(name) || !/\.[a-z0-9]+$/i.test(name)) {
      throw new Error(`Invalid source path: ${name.slice(0, 80)}`);
    }
    const key = name.toLowerCase();
    if (names.has(key)) throw new Error(`Duplicate source file: ${name}`);
    names.add(key);
    total += entry.content.length;
    if (total > MAX_TOTAL) throw new Error('Code project exceeds the 120,000 character limit.');
    return { path: name, content: entry.content };
  });
}

export async function createCodeProject(name: string, filesJson: string): Promise<string> {
  const files = parseCodeFiles(filesJson);
  const slug = name.trim().replace(/[^a-z0-9_\- ]/gi, '').replace(/\s+/g, '-').slice(0, 60);
  if (!slug) throw new Error('Enter a project name.');
  const root = `${await DT.workspaceDir()}/Code/${slug}`;
  if (await RNFS.exists(root)) throw new Error('Project already exists. Choose a different name.');
  const listing = files.map(f => `- ${f.path} (${f.content.length} characters)`).join('\n');
  if (!await DT.confirm('Create code project?', `${root}\n\n${listing}\n\nNo code will run.`, 'Create')) {
    return 'The user declined. No project files were created.';
  }
  await RNFS.mkdir(root);
  try {
    for (const file of files) {
      const target = `${root}/${file.path}`;
      await RNFS.mkdir(target.slice(0, target.lastIndexOf('/')));
      await RNFS.writeFile(target, file.content, 'utf8');
    }
  } catch (error) {
    await RNFS.unlink(root).catch(() => undefined);
    throw error;
  }
  return `Created ${files.length} code files in ${root}. Nothing was compiled or executed.`;
}
