import { Alert, NativeModules, PermissionsAndroid } from 'react-native';
import RNFS from 'react-native-fs';

/**
 * Atlas assistant tools: files, web pages, calendar, memory.
 * Anything that changes something (writing a file, adding an event) asks you first.
 */
const Native: any = NativeModules.AtlasDevice;
const TEXT_EXT = /\.(txt|md|markdown|html?|css|js|ts|json|csv|xml|ya?ml|ini|log|py|java|kt|c|cpp|h|sh)$/i;
const MAX_READ = 120_000;

export async function hasAllFiles(): Promise<boolean> {
  try { return !!(await Native?.hasAllFilesAccess()); } catch { return false; }
}
export async function requestAllFiles(): Promise<void> { await Native?.requestAllFilesAccess(); }

/** Workspace: Documents/Atlas when "All files access" is on, otherwise the app's own folder. */
export async function workspaceDir(): Promise<string> {
  const dir = (await hasAllFiles()) ? `${await Native.storageRoot()}/Documents/Atlas` : `${RNFS.ExternalDirectoryPath}/Workspace`;
  await RNFS.mkdir(dir);
  return dir;
}

async function resolvePath(p?: string): Promise<string> {
  const ws = await workspaceDir();
  if (!p || p === '.' || p === '/') return ws;
  let path = p.trim().replace(/^file:\/\//, '');
  if (!path.startsWith('/')) path = `${ws}/${path}`;
  path = path.replace(/\/+/g, '/');
  if (path.includes('/../') || path.endsWith('/..')) throw new Error('Paths with .. are not allowed.');
  const root = (await hasAllFiles()) ? await Native.storageRoot() : RNFS.ExternalDirectoryPath;
  if (!path.startsWith(root) && !path.startsWith(RNFS.ExternalDirectoryPath) && !path.startsWith(RNFS.DocumentDirectoryPath)) {
    throw new Error(`Outside allowed storage. ${(await hasAllFiles()) ? '' : 'Turn on "All files access" in Settings > Assistant access to reach your other folders.'}`);
  }
  return path;
}

export function confirm(title: string, message: string, ok = 'Allow'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Deny', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export async function listFiles(path?: string): Promise<string> {
  const dir = await resolvePath(path);
  if (!(await RNFS.exists(dir))) return `Folder not found: ${dir}`;
  const items = (await RNFS.readDir(dir)).sort((a: any, b: any) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  if (!items.length) return `${dir} is empty.`;
  return `${dir}\n` + items.slice(0, 200).map((it: any) => (it.isDirectory() ? `[folder] ${it.name}/` : `${it.name} (${kb(Number(it.size))})`)).join('\n');
}

export async function readFile(path: string): Promise<string> {
  const p = await resolvePath(path);
  if (!(await RNFS.exists(p))) return `File not found: ${p}`;
  const ext = `.${p.split('.').pop()?.toLowerCase()}`;
  const { OFFICE_EXTENSIONS, extractOffice } = require('../services/officeExtract');
  if (OFFICE_EXTENSIONS.includes(ext)) {
    try { return await extractOffice(p, ext, MAX_READ); } catch (e: any) { return `Could not read this file: ${e?.message || e}`; }
  }
  if (ext === '.pdf') {
    try {
      const { pdfExtractor } = require('../services/pdfExtractor');
      const t: string = await pdfExtractor.extractText(p, MAX_READ);
      return t ? t.slice(0, MAX_READ) : 'No text found in this PDF (it may be scanned pictures).';
    } catch (e: any) { return `Could not read this PDF: ${e?.message || e}`; }
  }
  if (!TEXT_EXT.test(p)) return 'This tool reads text, CSV, JSON, code, PDF, Word, PowerPoint, Excel, OpenDocument, EPUB and RTF files.';
  const t = await RNFS.readFile(p, 'utf8');
  return t.length > MAX_READ ? `${t.slice(0, MAX_READ)}\n...(cut at ${MAX_READ} characters)` : t;
}

export async function writeFile(path: string, content: string, append = false): Promise<string> {
  const p = await resolvePath(path);
  const exists = await RNFS.exists(p);
  const ok = await confirm(
    append ? 'Add to file?' : exists ? 'Replace file?' : 'Create file?',
    `${p}\n\n${content.slice(0, 400)}${content.length > 400 ? '\n...' : ''}`,
    append ? 'Add' : exists ? 'Replace' : 'Create',
  );
  if (!ok) return 'The user declined. Nothing was written.';
  await RNFS.mkdir(p.substring(0, p.lastIndexOf('/')));
  if (append && exists) await RNFS.appendFile(p, content, 'utf8');
  else await RNFS.writeFile(p, content, 'utf8');
  return `Saved ${p} (${content.length} characters).`;
}

export async function createWebPage(name: string, html: string): Promise<string> {
  const slug = (name || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
  const ws = await workspaceDir();
  const page = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title></head><body>${html}</body></html>`;
  const res = await writeFile(`${ws}/Sites/${slug}/index.html`, page);
  if (res.startsWith('The user declined')) return res;
  const path = `${ws}/Sites/${slug}/index.html`;
  try { await Native?.openFile(path); } catch { /* opening is optional */ }
  return `${res}\nOpened it for preview. Path: ${path}`;
}

export async function openFile(path: string): Promise<string> {
  const p = await resolvePath(path);
  if (!(await RNFS.exists(p))) return `File not found: ${p}`;
  await Native.openFile(p);
  return `Opened ${p}.`;
}

async function calendarPermission(): Promise<boolean> {
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALENDAR);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function calendarEvents(daysAhead = 7, daysBack = 0): Promise<string> {
  if (!(await calendarPermission())) return 'Calendar permission was not granted.';
  const start = Date.now() - daysBack * 86400000;
  const end = Date.now() + Math.max(1, daysAhead) * 86400000;
  const ev: any[] = await Native.calendarEvents(start, end);
  if (!ev.length) return 'No events in that period.';
  const f = (ms: number, allDay: boolean) => new Date(ms).toLocaleString(undefined, allDay ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return ev.map((e) => `- ${f(e.begin, e.allDay)}${e.allDay ? ' (all day)' : ` to ${new Date(e.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`).join('\n');
}

export async function addCalendarEvent(title: string, start: string, end?: string, location = '', description = ''): Promise<string> {
  const s = Date.parse(start);
  if (isNaN(s)) return 'Could not understand the start time. Use a format like 2026-10-05T14:00.';
  const e = end && !isNaN(Date.parse(end)) ? Date.parse(end) : s + 3600000;
  await Native.addCalendarEvent(title, s, e, location, description);
  return 'Opened the calendar with the event filled in. The user confirms and saves it there.';
}

/** Agent memory: facts the user wants the active agent to remember (stored on the phone). */
export async function rememberFact(fact: string): Promise<string> {
  const { useAgentStore } = require('../stores/agentStore');
  const st = useAgentStore.getState();
  const agent = st.agents.find((a: any) => a.id === st.activeAgentId);
  if (!agent) return 'No active agent to remember this for.';
  const memories: string[] = agent.memories || [];
  if (memories.some((m) => m.toLowerCase() === fact.toLowerCase())) return 'Already remembered.';
  st.updateAgent(agent.id, { memories: [...memories, fact.trim()].slice(-100) });
  return `Remembered: ${fact.trim()}`;
}
