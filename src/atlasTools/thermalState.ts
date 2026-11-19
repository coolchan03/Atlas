import { create } from 'zustand';

/**
 * How hot the phone is, as far as Atlas knows. The level is Android's thermal status (0 none ... 3 severe ... 6 shutdown); where the
 * phone does not report it, the battery temperature stands in (see thermal.ts). Not saved: heat is a fact about now.
 */
interface ThermalState {
  /** null until the first reading */
  level: number | null;
  hot: boolean;
  set: (level: number) => void;
}

/** Hot from SEVERE up; cool again only at LIGHT or below, so a phone hovering near the line does not flip answers on and off. */
const HOT_AT = 3;
const COOL_AT = 1;

export const nextHot = (wasHot: boolean, level: number): boolean => (wasHot ? level > COOL_AT : level >= HOT_AT);

export const useThermal = create<ThermalState>((set, get) => ({
  level: null,
  hot: false,
  set: (level) => set({ level, hot: nextHot(get().hot, level) }),
}));

export const thermalHot = (): boolean => useThermal.getState().hot;

/** Battery temperature (degrees C) as a thermal level for phones without the Android status: 42 C and up counts as severe, 38 C and under as light. */
export function levelFromBatteryTemp(celsius: number, wasHot: boolean): number {
  if (celsius >= 42) return HOT_AT;
  if (celsius <= 38) return 0;
  return wasHot ? HOT_AT : 2;
}
