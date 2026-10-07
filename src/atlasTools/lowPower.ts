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
  /** model low-battery mode switched to (to switch back later) */
  switchedTo: string;
  battery: number | null;
  charging: boolean;
  set: (p: Partial<LowPowerState>) => void;
}

export const useLowPower = create<LowPowerState>()(
  persist(
    (set) => ({
      enabled: false, threshold: 20, modelId: '', maxTokens: 256,
      active: false, prevModelId: '', switchedTo: '', battery: null, charging: false,
      set: (p) => set(p),
    }),
    {
      name: 'atlas-low-power',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ enabled: s.enabled, threshold: s.threshold, modelId: s.modelId, maxTokens: s.maxTokens }),
    },
  ),
);

const offGrid = (): boolean => { try { return require('./offGrid').offGridOn(); } catch { return false; } };
/** On when switched on, and always in off-grid (emergency) mode. */
export const lowPowerEnabled = (): boolean => useLowPower.getState().enabled || offGrid();
export const lowPowerActive = (): boolean => lowPowerEnabled() && useLowPower.getState().active;

/** The text model that uses the least battery per answer: fastest measured on this phone, else the smallest file. */
export function batteryModel(): { id: string; why: string } | null {
  try {
    const { useAppStore } = require('../stores/appStore');
    const { useSpeedStats } = require('./speed');
    const models: any[] = useAppStore.getState().downloadedModels || [];
    if (models.length < 2) return null;
    const sp = useSpeedStats.getState().byModel;
    const timed = models.filter((m) => sp[m.id]?.decode).sort((a, b) => sp[b.id].decode - sp[a.id].decode);
    if (timed.length >= 2) return { id: timed[0].id, why: `fastest on this phone (~${Math.round(sp[timed[0].id].decode * 0.75)} words/s)` };
    const small = [...models].sort((a, b) => (a.fileSize || 0) - (b.fileSize || 0))[0];
    return { id: small.id, why: 'smallest model you have' };
  } catch { return null; }
}
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
    if (!lowPowerEnabled()) {
      if (s.active) s.set({ active: false });
      return;
    }
    const { useAppStore } = require('../stores/appStore');
    const { switchToModelInBackground } = require('./models');
    if (!s.active && !charging && pct >= 0 && pct <= s.threshold) {
      const prev = useAppStore.getState().loadedTextModelId || useAppStore.getState().activeModelId || '';
      s.set({ active: true, prevModelId: prev });
      try { require('../atlasVoice/store').useAtlasVoiceStore.getState().setHandsFree(false); } catch { /* ignore */ }
      const target = s.modelId || batteryModel()?.id || '';
      if (target && target !== prev) { s.set({ switchedTo: target }); switchToModelInBackground(target); }
    } else if (s.active && (charging || pct > s.threshold + 5)) {
      s.set({ active: false });
      const to = useLowPower.getState().switchedTo;
      s.set({ switchedTo: '' });
      if (s.prevModelId && to && s.prevModelId !== to) switchToModelInBackground(s.prevModelId);
    }
  } catch { /* battery info unavailable */ }
}

export function startLowPowerMonitor(): void {
  if (timer) return;
  void check();
  timer = setInterval(() => { void check(); }, 60000);
}

export const checkBatteryNow = check;
