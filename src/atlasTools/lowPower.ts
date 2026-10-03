import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  active: boolean;
  prevModelId: string;
  battery: number | null;
  charging: boolean;
  set: (p: Partial<LowPowerState>) => void;
}

export const useLowPower = create<LowPowerState>()(
  persist(
    (set) => ({
      enabled: false, threshold: 20, modelId: '', maxTokens: 256,
      active: false, prevModelId: '', battery: null, charging: false,
      set: (p) => set(p),
    }),
    {
      name: 'atlas-low-power',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ enabled: s.enabled, threshold: s.threshold, modelId: s.modelId, maxTokens: s.maxTokens }),
    },
  ),
);

export const lowPowerActive = (): boolean => useLowPower.getState().enabled && useLowPower.getState().active;
export const LOW_POWER_NOTE = 'The phone battery is low: answer in a few short sentences, most important step first.';

let timer: ReturnType<typeof setInterval> | null = null;

async function check(): Promise<void> {
  try {
    const DeviceInfo = require('react-native-device-info').default;
    const level: number = await DeviceInfo.getBatteryLevel();
    const charging: boolean = await DeviceInfo.isBatteryCharging();
    const pct = Math.round(level * 100);
    const s = useLowPower.getState();
    s.set({ battery: pct, charging });
    if (!s.enabled) {
      if (s.active) s.set({ active: false });
      return;
    }
    const { useAppStore } = require('../stores/appStore');
    const { switchToModelInBackground } = require('./models');
    if (!s.active && !charging && pct >= 0 && pct <= s.threshold) {
      const prev = useAppStore.getState().loadedTextModelId || useAppStore.getState().activeModelId || '';
      s.set({ active: true, prevModelId: prev });
      try { require('../atlasVoice/store').useAtlasVoiceStore.getState().setHandsFree(false); } catch { /* ignore */ }
      if (s.modelId && s.modelId !== prev) switchToModelInBackground(s.modelId);
    } else if (s.active && (charging || pct > s.threshold + 5)) {
      s.set({ active: false });
      if (s.prevModelId && s.modelId && s.prevModelId !== s.modelId) switchToModelInBackground(s.prevModelId);
    }
  } catch { /* battery info unavailable */ }
}

export function startLowPowerMonitor(): void {
  if (timer) return;
  check();
  timer = setInterval(check, 60000);
}

export const checkBatteryNow = check;
