/**
 * Pause, resume and stop while documents are being added. A long scan can take a long time, and the person may need the phone for something
 * else: pausing waits at the next safe point (between files, and between scanned pages), and stopping leaves the files already added in place
 * and drops the one in progress (nothing half-added is kept). Imperative state that the indexer reads, with a small store for the buttons.
 */
import { create } from 'zustand';

interface State { paused: boolean; stopped: boolean; pause: () => void; resume: () => void; stop: () => void; reset: () => void; /** A run of adding documents starts: the controls are cleared unless another run is still going. */ begin: () => void; /** A run ends: the controls are cleared when none is left, so a pause is never left stuck. */ end: () => void }
let running = 0;

export const useIndexControl = create<State>((set) => ({
  paused: false, stopped: false,
  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),
  stop: () => set({ stopped: true, paused: false }),
  reset: () => set({ paused: false, stopped: false }),
  begin: () => { if (running === 0) set({ paused: false, stopped: false }); running += 1; },
  end: () => { running = Math.max(0, running - 1); if (running === 0) set({ paused: false, stopped: false }); },
}));

/** Thrown from inside the indexer when the person pressed stop. */
export class IndexStopped extends Error { constructor() { super('Stopped'); this.name = 'IndexStopped'; } }

/** A safe point: waits while paused, and says false when stopped. */
export function gate(): Promise<boolean> {
  const s = useIndexControl.getState();
  if (s.stopped) return Promise.resolve(false);
  if (!s.paused) return Promise.resolve(true);
  return new Promise((resolve) => {
    const off = useIndexControl.subscribe((next) => {
      if (next.stopped) { off(); resolve(false); } else if (!next.paused) { off(); resolve(true); }
    });
  });
}
