import { NativeModules, Platform } from 'react-native';
import logger from '../utils/logger';

const activeReasons = new Set<string>();
let nativeEnabled = false;
let nativeLabel: string | null = null;
let syncChain: Promise<void> = Promise.resolve();

async function syncNativeState(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const enabled = activeReasons.size > 0;
  const label = activeReasons.has('image-generation')
    ? 'Generating an image locally'
    : activeReasons.has('text-model-load')
      ? 'Loading a local AI model'
      : 'Generating a local AI response';
  const stateChanged = enabled !== nativeEnabled;
  const labelChanged = enabled && label !== nativeLabel;
  if (!stateChanged && !labelChanged) return;
  try {
    if (enabled && (stateChanged || labelChanged)) {
      await NativeModules.AtlasDevice?.setAiWorkActive?.(true, label);
    }
    if (stateChanged) await NativeModules.AtlasDevice?.setKeepScreenOn?.(enabled);
    if (!enabled && stateChanged) await NativeModules.AtlasDevice?.setAiWorkActive?.(false, null);
    nativeEnabled = enabled;
    nativeLabel = enabled ? label : null;
  } catch (error) {
    logger.warn('[RuntimePower] Native AI work state update failed:', error);
  }
}

function scheduleNativeSync(): void {
  syncChain = syncChain.then(syncNativeState, syncNativeState);
}

export function holdScreenAwake(reason: string): void {
  activeReasons.add(reason);
  scheduleNativeSync();
}

export function releaseScreenAwake(reason: string): void {
  activeReasons.delete(reason);
  scheduleNativeSync();
}

export function screenAwakeReasons(): string[] {
  return [...activeReasons];
}
