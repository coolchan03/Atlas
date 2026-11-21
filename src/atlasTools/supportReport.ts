/**
 * "Share all logs": one text file with everything needed to see what went wrong, so it can be handed over instead of described: the
 * phone and app summary (diagnostics.ts), the problems, the briefing player's trace, the newest lines of the app-wide log, and the end of
 * the previous session (which is what explains a crash). The formatter is pure and tested; the gatherer reads the running app.
 */
import { appLogLines, previousSessionLog, type AppLogLine } from '../utils/appLog';

const MAX_CHARS = 220_000;
const stamp = (l: AppLogLine): string => `${new Date(l.at).toISOString().slice(11, 19)} ${l.level === 'log' ? '' : `${l.level.toUpperCase()} `}${l.message}`;

export function formatSupportReport(parts: { diagnostics: string; state?: string; briefing: string[]; lines: AppLogLine[]; previous: string; now: number }): string {
  const problems = parts.lines.filter((l) => l.level !== 'log').slice(-60);
  const sections = [
    `Atlas logs, ${new Date(parts.now).toISOString()}`,
    parts.diagnostics,
    parts.state ? `STATE\n${parts.state}` : '',
    `PROBLEMS (warnings and errors, newest ${problems.length})\n${problems.map(stamp).join('\n') || '(none)'}`,
    parts.briefing.length ? `BRIEFING PLAYER\n${parts.briefing.join('\n')}` : '',
    `LOG (newest ${Math.min(500, parts.lines.length)} lines)\n${parts.lines.slice(-500).map(stamp).join('\n') || '(empty)'}`,
    parts.previous ? `PREVIOUS SESSION (the end of it)\n${parts.previous.split('\n').slice(-150).join('\n')}` : '',
  ].filter(Boolean);
  const text = sections.join('\n\n');
  return text.length > MAX_CHARS ? `${text.slice(0, 20_000)}\n\n[... middle left out ...]\n\n${text.slice(-(MAX_CHARS - 20_000))}` : text;
}

/**
 * What the phone and the app are doing right now, beyond the model summary: power and heat, every model on the phone with its measured
 * speed and what its test kept, the generation settings, and which AI work is running. Each piece that cannot be read is left out.
 */
function describeState(): string {
  const out: string[] = [];
  const part = (label: string, read: () => string | null): void => { try { const text = read(); if (text) out.push(`${label}: ${text}`); } catch { /* left out */ } };
  const { useAppStore } = require('../stores/appStore');
  const app = useAppStore.getState();
  part('Power', () => {
    const { useLowPower } = require('./lowPowerState');
    const { useThermal } = require('./thermalState');
    const { useOffGrid } = require('./offGridState');
    const low = useLowPower.getState();
    return `battery ${low.battery ?? '?'}%${low.charging ? ' (charging)' : ''}; low-battery mode ${low.enabled ? `on at ${low.threshold}%${low.active ? ', ACTIVE now' : ', not active'}` : 'off'}; heat guard ${low.heatGuard ? 'on' : 'off'}; phone heat level ${useThermal.getState().level ?? 'unknown'}${useThermal.getState().hot ? ' (hot)' : ''}; off-grid mode ${useOffGrid.getState().on ? 'on' : 'off'}`;
  });
  part('Models', () => {
    const { useSpeedStats, useTuned } = require('./speed');
    const speeds = useSpeedStats.getState().byModel;
    const tuned = useTuned.getState();
    return `\n${(app.downloadedModels as Array<Record<string, any>>).map((m) => {
      const sp = speeds[m.id];
      const mem = tuned.memory[m.id];
      return `  ${m.id === app.activeModelId ? '* ' : '  '}${m.name} | ${m.engine ?? 'llama'}${m.quantization ? `, ${m.quantization}` : ''} | ${Math.round((m.fileSize ?? 0) / 1048576)} MB | ${sp ? `writes ${sp.decode.toFixed(1)}, reads ${Math.round(sp.prefill)} tok/s, ${sp.samples} replies` : 'no speed yet'} | ${tuned.at[m.id] ? `tested${tuned.accelerator[m.id] ? ` (${tuned.accelerator[m.id]})` : ''}${mem ? `, kept ${JSON.stringify({ ...mem, from: undefined })}` : ''}` : 'not tested'}`;
    }).join('\n')}`;
  });
  part('Generation', () => { const s = app.settings; return `temperature ${s.temperature}, top-p ${s.topP}, max answer ${s.maxTokens} tokens, context ${s.contextMode === 'auto' ? 'automatic' : s.contextLength}, batch ${s.nBatch}, threads ${s.nThreads || 'auto'}, backend ${s.inferenceBackend}, cache ${s.cacheType}, flash attention ${s.flashAttn ? 'on' : 'off'}`; });
  part('Where the time went (last requests)', () => { const lines = require('./stageTimes').stageSummary(); return lines.length ? `\n  ${lines.join('\n  ')}` : null; });
  part('Working now', () => {
    const { currentWork } = require('../topics/liveWork');
    const { screenAwakeReasons } = require('./runtimePower');
    const { isLearning } = require('../learning/engine');
    const w = currentWork();
    return `${w.phase === 'idle' ? 'no lesson call' : `lesson call ${w.phase}`}; learning ${isLearning() ? 'running' : 'idle'}; screen-on reasons: ${screenAwakeReasons().join(', ') || 'none'}`;
  });
  return out.join('\n');
}

/** Reads the app: the diagnostics summary, the briefing trace and the logs. Any part that cannot be read is left out. */
export async function gatherSupportReport(): Promise<string> {
  let diagnostics = '';
  try { diagnostics = await require('./diagnostics').gatherDiagnostics(); } catch { diagnostics = '(the phone summary could not be read)'; }
  let briefing: string[] = [];
  try { briefing = require('../atlasVoice/briefTrace').briefTrace(); } catch { briefing = []; }
  let state = '';
  try { state = describeState(); } catch { state = ''; }
  return formatSupportReport({ diagnostics, state, briefing, lines: appLogLines(), previous: previousSessionLog(), now: Date.now() });
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
