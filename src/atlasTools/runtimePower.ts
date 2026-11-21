import { NativeModules, Platform } from 'react-native';
import logger from '../utils/logger';

/**
 * The ONE owner of "keep the screen on" and "keep working when the screen goes off". Two phone settings, held by reasons:
 * - the screen-on flag, held by `holdScreenAwake` (AI work: also starts the foreground notice) and `holdScreenOnly` (a screen that
 *   just needs the display awake: recording, a long export, a call);
 * - the foreground AI-work notice that lets Atlas keep running with the display off, held by `holdScreenAwake` and `holdBackgroundWork`.
 * A feature letting go of its reason never takes the other features' holds away, which is what used to turn the screen off in the
 * middle of the AI learning (two native modules were setting and clearing the same window flag).
 */
const screenReasons = new Set<string>();
const workReasons = new Set<string>();
let nativeWork = false;
let nativeScreen = false;
let nativeLabel: string | null = null;
let syncChain: Promise<void> = Promise.resolve();

const labelFor = (): string => {
  const has = (r: string) => workReasons.has(r);
  if (has('image-generation')) return 'Generating an image locally';
  if (has('text-model-load')) return 'Loading a local AI model';
  if (has('learning')) return 'Learning in the background';
  return 'Generating a local AI response';
};

async function syncNativeState(): Promise<void> {
  if (!Platform || Platform.OS !== 'android') return;
  const work = workReasons.size > 0;
  const screen = screenReasons.size > 0;
  const label = labelFor();
  const device = NativeModules?.AtlasDevice;
  try {
    if (work && (!nativeWork || label !== nativeLabel)) await device?.setAiWorkActive?.(true, label);
    if (screen !== nativeScreen) await device?.setKeepScreenOn?.(screen);
    if (!work && nativeWork) await device?.setAiWorkActive?.(false, null);
    nativeWork = work; nativeScreen = screen; nativeLabel = work ? label : null;
  } catch (error) {
    logger.warn('[RuntimePower] Native AI work state update failed:', error);
  }
}

function scheduleNativeSync(): void {
  syncChain = syncChain.then(syncNativeState, syncNativeState);
}

/** Puts the phone's state back now, even if nothing changed (Android can drop the flag when the screen is recreated). */
export function refreshPower(): void {
  nativeScreen = !screenReasons.size; // force the next sync to send the screen state again
  scheduleNativeSync();
}

/** AI work that needs the display on and the foreground notice (generation, loading a model). */
export function holdScreenAwake(reason: string): void {
  screenReasons.add(reason); workReasons.add(reason);
  scheduleNativeSync();
}
export function releaseScreenAwake(reason: string): void {
  screenReasons.delete(reason); workReasons.delete(reason);
  scheduleNativeSync();
}

/** Only the display kept on (no notice): for a screen that is being watched or recorded. */
export function holdScreenOnly(reason: string, on: boolean): void {
  if (on) screenReasons.add(reason); else screenReasons.delete(reason);
  scheduleNativeSync();
}

/** Only the foreground notice, so Atlas keeps working when the display goes off (the display itself is left to the person's setting). */
export function holdBackgroundWork(reason: string, on: boolean): void {
  if (on) workReasons.add(reason); else workReasons.delete(reason);
  scheduleNativeSync();
}

export function screenAwakeReasons(): string[] {
  return [...new Set([...screenReasons, ...workReasons])];
}
