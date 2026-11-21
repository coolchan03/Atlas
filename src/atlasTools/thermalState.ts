import { create } from 'zustand';

/**
 * How hot the phone is, as far as Atlas knows. The level is Android's thermal status (0 none ... 3 severe ... 6 shutdown); where the
 * phone does not report it, the battery temperature stands in (see thermal.ts). Not saved: heat is a fact about now.
 */
interface ThermalState {
  /** null until the first reading */
  level: number | null;
  hot: boolean;
  /** How many readings in a row have been at the hot line or above. */
  hotStreak?: number;
  set: (level: number) => void;
}

/** Hot from SEVERE up; cool again only at LIGHT or below, so a phone hovering near the line does not flip answers on and off. */
const HOT_AT = 3;
const COOL_AT = 1;

/** Android's CRITICAL: components are being shut down, so waiting to be sure would be the wrong call. */
const IMMEDIATE_AT = 4;
/** SEVERE must be read this many times in a row (the monitor reads every 30 seconds) before the guard engages: one passing spike is not heat. */
export const SUSTAINED_READINGS = 2;

/**
 * Whether answers should be limited. Engaging takes SEVERE on consecutive readings (or CRITICAL at once), so a transient reading never cuts
 * short work the person asked for; releasing is the existing hysteresis (LIGHT or below). `streak` is the readings at or above the line,
 * counting this one; callers with no history get the previous immediate behaviour.
 */
export const nextHot = (wasHot: boolean, level: number, streak: number = SUSTAINED_READINGS): boolean => {
  if (wasHot) return level > COOL_AT;
  if (level >= IMMEDIATE_AT) return true;
  return level >= HOT_AT && streak >= SUSTAINED_READINGS;
};

export const useThermal = create<ThermalState>((set, get) => ({
  level: null,
  hot: false,
  hotStreak: 0,
  set: (level) => {
    const streak = level >= HOT_AT ? (get().hotStreak ?? 0) + 1 : 0;
    set({ level, hotStreak: streak, hot: nextHot(get().hot, level, streak) });
  },
}));

export const thermalHot = (): boolean => useThermal.getState().hot;

/** Battery temperature (degrees C) as a thermal level for phones without the Android status: 42 C and up counts as severe, 38 C and under as light. */
export function levelFromBatteryTemp(celsius: number, wasHot: boolean): number {
  if (celsius >= 42) return HOT_AT;
  if (celsius <= 38) return 0;
  return wasHot ? HOT_AT : 2;
}
