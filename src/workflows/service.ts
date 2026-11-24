/**
 * Owns every workflow run: starts them, saves them after each step, and hands the person's answers back to the
 * engine. Screens only show `useWorkflowRuns` and call these functions; none of the logic lives in a screen.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { advance, answer, approve, cancel, newRun, type Ask, type Run, type Workflow } from './engine';
import { accountant } from './accountant';
import { bill, meeting } from './everyday';
import { contract, cook, explain, howItWorks, repair, writing } from './helperJobs';
import { budget, decision, mealWeek, studyPlan } from './moreJobs';
import { toWorkflow, useCustomHelpers } from './customHelpers';
import { localUniqueId } from '../utils/uniqueId';

type AnyRun = Run<any>;
const WORKFLOWS: Record<string, Workflow<any>> = { accountant, meeting, bill, repair, cook, explain, writing, howitworks: howItWorks, contract, budget, studyplan: studyPlan, mealweek: mealWeek, decision };
/** Every helper: the built-in ones, then the ones the person wrote. */
export const workflowList = (): Array<Workflow<any>> => [...Object.values(WORKFLOWS), ...useCustomHelpers.getState().helpers.map(toWorkflow)];
const workflowById = (id: string): Workflow<any> | undefined => WORKFLOWS[id] ?? workflowList().find((w) => w.id === id);

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
  const wf = workflowById(run.workflowId);
  if (!wf) throw new Error('This job is not available any more.');
  return wf;
};

/** Starts a job from the text and extra choices its input asks for. */
export function startWorkflow(id: string, text: string, fields: Record<string, string> = {}): Promise<AnyRun> {
  const wf = workflowById(id);
  if (!wf) return Promise.reject(new Error('This job is not available any more.'));
  const ctx = wf.input.make(text, fields);
  // Category choices the person made on earlier statements carry over.
  if (id === 'accountant') ctx.rules = useWorkflowRuns.getState().rules;
  return advance(wf, newRun(wf, localUniqueId('wf'), ctx), deps);
}

/** Starts a job and says at once which run it is, so the screen can show its steps while they run. `done` settles when the job needs the person or has finished. */
export function beginWorkflow(id: string, text: string, fields: Record<string, string> = {}): { runId: string; done: Promise<AnyRun> } {
  const wf = workflowById(id);
  if (!wf) return { runId: '', done: Promise.reject(new Error('This job is not available any more.')) };
  const ctx = wf.input.make(text, fields);
  if (id === 'accountant') ctx.rules = useWorkflowRuns.getState().rules;
  const run = newRun(wf, localUniqueId('wf'), ctx);
  return { runId: run.id, done: advance(wf, run, deps) };
}

/** The titles of a job's steps, in order (empty when the job is gone). */
export const stepTitles = (workflowId: string): string[] => workflowById(workflowId)?.steps.map((s) => s.title) ?? [];

export const answerRun = (run: AnyRun, answers: Record<string, string>): Promise<AnyRun> => answer(workflowFor(run), run, { answers, deps });
export const approveRun = (run: AnyRun): Promise<AnyRun> => approve(workflowFor(run), run, deps);
export const cancelRun = (run: AnyRun): void => save(cancel(run));
/** Carries on a run that was left waiting or interrupted (the app was closed mid-step). */
export const resumeRun = (run: AnyRun): Promise<AnyRun> => (run.status === 'running' || run.status === 'failed') ? advance(workflowFor(run), run, deps) : Promise.resolve(run);
