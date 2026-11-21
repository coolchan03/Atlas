import { NativeModules } from 'react-native';
import logger from '../utils/logger';

/**
 * Why the previous run of the app ended, as the operating system recorded it. Android keeps this (ApplicationExitInfo, Android 11 and up);
 * iOS gives an app no such record without a crash-reporting service, so there the native module says `supported: false` and everything here
 * carries on as before. One contract on both platforms: `DeviceMemoryModule.getLastExitReasons(max)` -> { supported, reasons }.
 */
export interface ExitReason {
  /** When the process ended (ms since 1970). */
  at: number;
  /** The system's code, e.g. LOW_MEMORY, CRASH_NATIVE, USER_REQUESTED. */
  reason: string;
  /** What the system wrote about it (often empty). */
  description: string;
  rssKb?: number;
}
interface ExitInfo { supported: boolean; reasons: ExitReason[] }

const NO_EXIT_INFO: ExitInfo = { supported: false, reasons: [] };

const PLAIN: Record<string, string> = {
  LOW_MEMORY: 'Android closed Atlas because the phone ran out of memory',
  CRASH_NATIVE: 'a native library crashed (the model engine or another compiled library)',
  CRASH: 'the app crashed',
  ANR: 'the app stopped responding and was closed',
  SIGNALED: 'the process was ended by a signal (often a crash in native code)',
  INITIALIZATION_FAILURE: 'the app could not start',
  EXCESSIVE_RESOURCE_USAGE: 'Android closed Atlas for using too many resources',
  USER_REQUESTED: 'the person closed the app',
  USER_STOPPED: 'the person force-stopped the app',
  EXIT_SELF: 'the app closed itself',
  PERMISSION_CHANGE: 'a permission was changed, which restarts the app',
  DEPENDENCY_DIED: 'something the app depends on ended',
  FREEZER: 'Android froze the app in the background',
  OTHER: 'the system ended it for another reason',
};

export const explainExit = (r: ExitReason): string => `${PLAIN[r.reason] ?? `the system reported ${r.reason || 'an unknown reason'}`}${r.description ? ` (${r.description})` : ''}`;

/**
 * Endings that say nothing about the model: the person (or a permission change) chose them. A model load cut short by one of these was not a model
 * crash. EXIT_SELF is deliberately NOT here: a native library that calls exit() while a model loads also reads as the app closing itself, and
 * mistaking that for a harmless exit would let a crashing setup be tried again and again.
 */
const BENIGN = new Set(['USER_REQUESTED', 'USER_STOPPED', 'PERMISSION_CHANGE']);
export const isBenignExit = (r: ExitReason): boolean => BENIGN.has(r.reason);

/** The recorded endings, newest first. Never throws: no module, an old Android, or a failed call all read as "no information". */
async function readExitInfo(max = 5): Promise<ExitInfo> {
  const mod = NativeModules?.DeviceMemoryModule;
  if (!mod?.getLastExitReasons) return NO_EXIT_INFO;
  try {
    const raw = await mod.getLastExitReasons(max);
    if (!raw?.supported || !Array.isArray(raw.reasons)) return NO_EXIT_INFO;
    const reasons: ExitReason[] = raw.reasons
      .map((r: Partial<ExitReason>) => ({ at: Number(r.at) || 0, reason: String(r.reason ?? ''), description: String(r.description ?? ''), rssKb: r.rssKb === undefined ? undefined : Number(r.rssKb) }))
      .filter((r: ExitReason) => r.at > 0)
      .sort((a: ExitReason, b: ExitReason) => b.at - a.at);
    return { supported: true, reasons };
  } catch (e) {
    logger.warn('[EXIT] could not read the system exit record:', e);
    return NO_EXIT_INFO;
  }
}

let noted: Promise<ExitReason | null> | null = null;
/** Once per launch: writes how the previous run ended to the app log (kept in every build) and returns it. Safe to call from anywhere. */
export function noteLastExit(): Promise<ExitReason | null> {
  if (!noted) {
    noted = readExitInfo(1).then((info) => {
      const last = info.reasons[0] ?? null;
      if (last) logger.log(`[EXIT] the previous run ended: ${explainExit(last)}${last.rssKb ? `; it held about ${Math.round(last.rssKb / 1024)} MB` : ''}`);
      return last;
    });
  }
  return noted;
}

export function __resetExitReasonsForTests(): void { noted = null; }
