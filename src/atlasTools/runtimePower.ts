import { NativeModules, Platform } from 'react-native';
import logger from '../utils/logger';

const activeReasons = new Set<string>();
let nativeEnabled = false;

async function syncNativeState(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const enabled = activeReasons.size > 0;
  if (enabled === nativeEnabled) return;
  nativeEnabled = enabled;
  try {
    await NativeModules.AtlasDevice?.setKeepScreenOn?.(enabled);
  } catch (error) {
    logger.warn('[RuntimePower] Native display flag update failed:', error);
  }
}

export function holdScreenAwake(reason: string): void {
  activeReasons.add(reason);
  void syncNativeState();
}

export function releaseScreenAwake(reason: string): void {
  activeReasons.delete(reason);
  void syncNativeState();
}

export function screenAwakeReasons(): string[] {
  return [...activeReasons];
}
