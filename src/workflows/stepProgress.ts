import { create } from 'zustand';

type StepState = 'waiting' | 'running' | 'done';
export interface ProgressItem { label: string; state: StepState; /** What it is doing now ("Reading part 3 of 9"). */ note?: string }

/**
 * The steps of the job the chat is doing in steps, as they run: each step waiting, running or done. The job (autoSteps.ts) writes it; the chat
 * shows it under the tool call while `active`. Never saved: it describes what is happening now.
 */
interface ProgressState {
  active: boolean;
  items: ProgressItem[];
  begin: (items: string[]) => void;
  mark: (index: number, state: StepState, note?: string) => void;
  end: () => void;
}

export const useStepProgress = create<ProgressState>((set) => ({
  active: false,
  items: [],
  begin: (labels) => set({ active: true, items: labels.map((label, i) => ({ label, state: i === 0 ? 'running' : 'waiting' })) }),
  mark: (index, state, note) => set((s) => ({ items: s.items.map((item, i) => (i === index ? { ...item, state, note } : item)) })),
  end: () => set({ active: false }),
}));

/** The steps of a helper's run with where it is: the steps before `step` are done, that one is running (or needs the person, or failed), the rest wait. Pure. */
export function runItems(titles: string[], run: { step: number; status: string }): ProgressItem[] {
  return titles.map((label, i) => {
    if (run.status === 'done' || i < run.step) return { label, state: 'done' as const };
    if (i > run.step) return { label, state: 'waiting' as const };
    if (run.status === 'running') return { label, state: 'running' as const, note: 'Working on it' };
    if (run.status === 'waiting') return { label, state: 'waiting' as const, note: 'Needs you' };
    return { label, state: 'waiting' as const, note: run.status === 'failed' ? 'Stopped here' : 'Cancelled' };
  });
}
