import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { offGridOn } from './offGridState';
import { thermalHot } from './thermalState';

/**
 * Atlas low-battery mode. Below the threshold (and not charging):
 *  - switch to a small model (if chosen),
 *  - keep answers short (token cap + a one-line instruction),
 *  - turn off hands-free listening.
 * When charging or back above threshold + 5%, the previous model is restored.
 */
interface LowPowerState {
  enabled: boolean;
  threshold: number;
  modelId: string;
  maxTokens: number;
  /** Keep answers short while the phone is too hot (thermal.ts). On unless switched off. */
  heatGuard: boolean;
  active: boolean;
  prevModelId: string;
  /** model low-battery mode switched to (to switch back later) */
  switchedTo: string;
  battery: number | null;
  charging: boolean;
  set: (p: Partial<LowPowerState>) => void;
}

export const useLowPower = create<LowPowerState>()(
  persist(
    (set) => ({
      enabled: false, threshold: 20, modelId: '', maxTokens: 256, heatGuard: true,
      active: false, prevModelId: '', switchedTo: '', battery: null, charging: false,
      set: (p) => set(p),
    }),
    {
      name: 'atlas-low-power',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ enabled: s.enabled, threshold: s.threshold, modelId: s.modelId, maxTokens: s.maxTokens, heatGuard: s.heatGuard }),
    },
  ),
);

/** On when switched on, and always in off-grid (emergency) mode. */
export const lowPowerEnabled = (): boolean => useLowPower.getState().enabled || offGridOn();
/** True while the phone is hot and the heat guard is on. */
export const heatLimited = (): boolean => useLowPower.getState().heatGuard && thermalHot();
/** Answers are held short: the battery is low (and the mode is on), or the phone is too hot. */
/** True while low-battery mode is on and has kicked in. */
export const batteryLimited = (): boolean => lowPowerEnabled() && useLowPower.getState().active;
export const lowPowerActive = (): boolean => batteryLimited() || heatLimited();

export const HEAT_NOTE = 'The phone is hot: answer in a few short sentences, most important point first.';
export const LOW_POWER_NOTE = 'The phone battery is low: answer in a few short sentences, most important step first.';
