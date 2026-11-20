/**
 * The app-wide log: every `logger.*` line is kept (newest 3000 in memory, and a rolling file of about a megabyte on the phone) in EVERY
 * build, not only in development, so "Share all logs" in About can hand over what actually happened instead of a description of it.
 * The file survives a crash or a restart: the next session reads the tail of it as "previous session". Logging must never throw,
 * and never slow the app: lines are cut short, and the file is written in batches. Nothing here leaves the phone unless the person shares it.
 */
export interface AppLogLine { at: number; level: 'log' | 'warn' | 'error'; message: string }

const MAX_LINES = 3000;
const MAX_LINE_CHARS = 700;
const FILE_CAP_BYTES = 1_000_000;
const FLUSH_MS = 4000;

const ring: AppLogLine[] = [];
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let previousSession = '';

const underJest = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID; // tests keep the memory copy only

const show = (a: unknown): string => {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try { return JSON.stringify(a) ?? String(a); } catch { return String(a); }
};

function filePath(): string | null {
  try { return `${require('react-native-fs').DocumentDirectoryPath}/atlas-app.log`; } catch { return null; }
}

async function flush(): Promise<void> {
  timer = null;
  const path = filePath();
  if (!path || !pending.length) { pending = []; return; }
  const chunk = pending.join('');
  pending = [];
  try {
    const RNFS = require('react-native-fs');
    await RNFS.appendFile(path, chunk, 'utf8');
    const stat = await RNFS.stat(path).catch(() => null);
    if (stat && Number(stat.size) > FILE_CAP_BYTES) {
      const text = await RNFS.readFile(path, 'utf8').catch(() => '');
      await RNFS.writeFile(path, text.slice(-Math.floor(FILE_CAP_BYTES / 2)), 'utf8').catch(() => undefined);
    }
  } catch { /* the file is a convenience: the memory copy still works */ }
}

/** Keeps one log line. Called by the logger for every line. */
export function noteAppLog(level: AppLogLine['level'], args: unknown[]): void {
  try {
    const message = args.map(show).join(' ').slice(0, MAX_LINE_CHARS);
    const at = Date.now();
    ring.push({ at, level, message });
    if (ring.length > MAX_LINES) ring.splice(0, ring.length - MAX_LINES);
    if (underJest) return;
    pending.push(`${new Date(at).toISOString()} [${level}] ${message}\n`);
    if (!timer) timer = setTimeout(() => { void flush(); }, FLUSH_MS);
    (timer as { unref?: () => void }).unref?.();
  } catch { /* never throw from logging */ }
}

export const appLogLines = (): AppLogLine[] => [...ring];

/** Reads the end of the file the last session left, once at start, so a crash can be explained by what came just before it. */
export async function loadPreviousSession(): Promise<void> {
  const path = filePath();
  if (!path || underJest) return;
  try {
    const RNFS = require('react-native-fs');
    if (!(await RNFS.exists(path))) return;
    const text: string = await RNFS.readFile(path, 'utf8');
    previousSession = text.slice(-60_000);
    pending.push(`\n===== session start ${new Date().toISOString()} =====\n`);
    if (!timer) timer = setTimeout(() => { void flush(); }, FLUSH_MS);
  } catch { previousSession = ''; }
}
export const previousSessionLog = (): string => previousSession;

/** Tests: forget everything. */
export function clearAppLog(): void { ring.length = 0; pending = []; previousSession = ''; }
