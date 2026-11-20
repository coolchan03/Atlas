/**
 * "Share all logs": one text file with everything needed to see what went wrong, so it can be handed over instead of described: the
 * phone and app summary (diagnostics.ts), the problems, the briefing player's trace, the newest lines of the app-wide log, and the end of
 * the previous session (which is what explains a crash). The formatter is pure and tested; the gatherer reads the running app.
 */
import { appLogLines, previousSessionLog, type AppLogLine } from '../utils/appLog';

const MAX_CHARS = 220_000;
const stamp = (l: AppLogLine): string => `${new Date(l.at).toISOString().slice(11, 19)} ${l.level === 'log' ? '' : `${l.level.toUpperCase()} `}${l.message}`;

export function formatSupportReport(parts: { diagnostics: string; briefing: string[]; lines: AppLogLine[]; previous: string; now: number }): string {
  const problems = parts.lines.filter((l) => l.level !== 'log').slice(-60);
  const sections = [
    `Atlas logs, ${new Date(parts.now).toISOString()}`,
    parts.diagnostics,
    `PROBLEMS (warnings and errors, newest ${problems.length})\n${problems.map(stamp).join('\n') || '(none)'}`,
    parts.briefing.length ? `BRIEFING PLAYER\n${parts.briefing.join('\n')}` : '',
    `LOG (newest ${Math.min(500, parts.lines.length)} lines)\n${parts.lines.slice(-500).map(stamp).join('\n') || '(empty)'}`,
    parts.previous ? `PREVIOUS SESSION (the end of it)\n${parts.previous.split('\n').slice(-150).join('\n')}` : '',
  ].filter(Boolean);
  const text = sections.join('\n\n');
  return text.length > MAX_CHARS ? `${text.slice(0, 20_000)}\n\n[... middle left out ...]\n\n${text.slice(-(MAX_CHARS - 20_000))}` : text;
}

/** Reads the app: the diagnostics summary, the briefing trace and the logs. Any part that cannot be read is left out. */
export async function gatherSupportReport(): Promise<string> {
  let diagnostics = '';
  try { diagnostics = await require('./diagnostics').gatherDiagnostics(); } catch { diagnostics = '(the phone summary could not be read)'; }
  let briefing: string[] = [];
  try { briefing = require('../atlasVoice/briefTrace').briefTrace(); } catch { briefing = []; }
  return formatSupportReport({ diagnostics, briefing, lines: appLogLines(), previous: previousSessionLog(), now: Date.now() });
}

/** Saves the report as a text file and opens the phone's share sheet for it. Returns false when it could not be saved or shared. */
export async function shareSupportReport(): Promise<boolean> {
  const text = await gatherSupportReport();
  const { shareItem } = require('../utils/shareItem');
  try {
    const RNFS = require('react-native-fs');
    const path = `${RNFS.CachesDirectoryPath}/atlas-logs.txt`;
    await RNFS.writeFile(path, text, 'utf8');
    return await shareItem({ file: path, title: 'Atlas logs' });
  } catch { return await shareItem({ text, title: 'Atlas logs' }); }
}
