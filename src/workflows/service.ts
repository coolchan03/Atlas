/**
 * Owns every workflow run: starts them, saves them after each step, and hands the person's answers back to the
 * engine. Screens only show `useWorkflowRuns` and call these functions; none of the logic lives in a screen.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { advance, answer, approve, cancel, newRun, type Ask, type Run, type Workflow } from './engine';
import { accountant, type AccountantCtx } from './accountant';
import { bill, meeting, type BillCtx, type MeetingCtx } from './everyday';
import { localUniqueId } from '../utils/uniqueId';

type AnyRun = Run<any>;
const WORKFLOWS: Record<string, Workflow<any>> = { accountant, meeting, bill };
export const workflowList = (): Array<Workflow<any>> => Object.values(WORKFLOWS);

interface RunsState { runs: AnyRun[]; rules: Record<string, string>; put: (r: AnyRun) => void; remove: (id: string) => void; setRules: (rules: Record<string, string>) => void }
export const useWorkflowRuns = create<RunsState>()(persist((set) => ({
  runs: [],
  rules: {},
  put: (r) => set((s) => ({ runs: [r, ...s.runs.filter((x) => x.id !== r.id)].slice(0, 10) })),
  remove: (id) => set((s) => ({ runs: s.runs.filter((r) => r.id !== id) })),
  setRules: (rules) => set({ rules }),
}), { name: 'atlas-workflows', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ runs: s.runs, rules: s.rules }) }));

/** One grounded model call, using whichever text model is loaded. */
const ask: Ask = (system, user) => require('../study/engine').askModel(system, user);

const save = (r: AnyRun) => {
  useWorkflowRuns.getState().put(r);
  // Category rules the person taught are kept for the next statement.
  if (r.workflowId === 'accountant' && r.ctx?.rules) useWorkflowRuns.getState().setRules(r.ctx.rules);
};
const deps = { ask, save };
const workflowFor = (run: AnyRun): Workflow<any> => {
  const wf = WORKFLOWS[run.workflowId];
  if (!wf) throw new Error('This job is not available any more.');
  return wf;
};

export function startAccountant(text: string): Promise<AnyRun> {
  const ctx: AccountantCtx = { text, year: new Date().getFullYear(), rules: useWorkflowRuns.getState().rules };
  return advance(accountant, newRun(accountant, localUniqueId('wf'), ctx), deps);
}
export function startMeeting(transcript: string, title: string): Promise<AnyRun> {
  const ctx: MeetingCtx = { transcript, title: title.trim() || 'Meeting' };
  return advance(meeting, newRun(meeting, localUniqueId('wf'), ctx), deps);
}
export function startBill(text: string, reminderDays: number): Promise<AnyRun> {
  const ctx: BillCtx = { text, reminderDays };
  return advance(bill, newRun(bill, localUniqueId('wf'), ctx), deps);
}

export const answerRun = (run: AnyRun, answers: Record<string, string>): Promise<AnyRun> => answer(workflowFor(run), run, { answers, deps });
export const approveRun = (run: AnyRun): Promise<AnyRun> => approve(workflowFor(run), run, deps);
export const cancelRun = (run: AnyRun): void => save(cancel(run));
/** Carries on a run that was left waiting or interrupted (the app was closed mid-step). */
export const resumeRun = (run: AnyRun): Promise<AnyRun> => (run.status === 'running' || run.status === 'failed') ? advance(workflowFor(run), run, deps) : Promise.resolve(run);
