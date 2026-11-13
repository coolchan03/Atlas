/**
 * Resizable two-pane layouts for tablets and unfolded phones. The split follows the WINDOW (wide windows put the panes side by side,
 * tall windows stack them) and the person's chosen ratio is remembered for each window shape, not for the device. Pure helpers plus a
 * tiny persisted store.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MIN_RATIO = 0.25;
export const MAX_RATIO = 0.75;
export const DEFAULT_RATIO = 0.5;
export type PaneDirection = 'row' | 'column';

/** Side by side when the window is wider than tall, stacked (preview below) when it is taller. */
export const paneDirection = (width: number, height: number): PaneDirection => (width >= height ? 'row' : 'column');
export const clampRatio = (r: number): number => (Number.isFinite(r) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)) : DEFAULT_RATIO);
/** One stored ratio per layout class and direction, so landscape and portrait remember their own. */
export const ratioKey = (layoutClass: string, direction: PaneDirection): string => `${layoutClass}-${direction}`;
/** The ratio after dragging the divider by `delta` pixels in a container `size` pixels long. */
export const dragRatio = (start: number, delta: number, size: number): number => (size > 0 ? clampRatio(start + delta / size) : clampRatio(start));

interface State { ratios: Record<string, number>; setRatio: (key: string, ratio: number) => void; reset: () => void }
export const usePaneRatios = create<State>()(persist((set) => ({
  ratios: {},
  setRatio: (key, ratio) => set((s) => ({ ratios: { ...s.ratios, [key]: clampRatio(ratio) } })),
  reset: () => set({ ratios: {} }),
}), { name: 'atlas-pane-ratios', storage: createJSONStorage(() => AsyncStorage) }));
