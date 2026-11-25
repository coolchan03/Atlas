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
import { skillHelper } from '../skills/skillSteps';
import { useSkills } from '../skills/skillsStore';
import { localUniqueId } from '../utils/uniqueId';

type AnyRun = Run<any>;
const WORKFLOWS: Record<string, Workflow<any>> = { accountant, meeting, bill, repair, cook, explain, writing, howitworks: howItWorks, contract, budget, studyplan: studyPlan, mealweek: mealWeek, decision };
/** Every helper: the built-in ones, then the ones the person wrote. */
export const workflowList = (): Array<Workflow<any>> => [...Object.values(WORKFLOWS), ...useCustomHelpers.getState().helpers.map(toWorkflow)];
/** The installed skills that are written as steps, as jobs of their own (run from the Skills screen, not listed with the helpers). */
const skillWorkflows = (): Array<Workflow<any>> => useSkills.getState().skills.flatMap((s) => { const h = skillHelper(s); return h ? [toWorkflow(h)] : []; });
export const workflowById = (id: string): Workflow<any> | undefined => WORKFLOWS[id] ?? workflowList().find((w) => w.id === id) ?? skillWorkflows().find((w) => w.id === id);

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

/**
 * The specialist whose built-in knowledge a built-in job works with: the repair job has the Repair Helper's safety facts, the dinner jobs the
 * Home Chef's food safety temperatures, the writing job the Writer's basics, the paperwork jobs the Paperwork Reader's care with exact words.
 * The specialist's prompt (and what it has learned) goes in front of each step's own instruction, so the facts are there at every step.
 */
const SPECIALIST: Record<string, string> = { repair: 'repair-helper', cook: 'home-chef', mealweek: 'home-chef', writing: 'writer', accountant: 'accountant', explain: 'paperwork-reader', contract: 'paperwork-reader', bill: 'paperwork-reader' };
function depsFor(wf: Workflow<any>): typeof deps {
  const specialist = SPECIALIST[wf.id];
  if (!specialist) return deps;
  return { ...deps, ask: (system, user) => {
    const agent = require('../stores/agentStore').useAgentStore.getState().getAgent(specialist);
    return ask(agent ? `${require('../stores/agentStore').agentPromptWithLessons(agent)}\n\n${system}` : system, user);
  } };
}
const workflowFor = (run: AnyRun): Workflow<any> => {
  const wf = workflowById(run.workflowId);
  if (!wf) throw new Error('This job is not available any more.');
  return wf;
};

/** Starts a job and says at once which run it is, so the screen can show its steps while they run. `done` settles when the job needs the person or has finished. */
export function beginWorkflow(id: string, text: string, fields: Record<string, string> = {}): { runId: string; done: Promise<AnyRun> } {
  const wf = workflowById(id);
  if (!wf) return { runId: '', done: Promise.reject(new Error('This job is not available any more.')) };
  const ctx = wf.input.make(text, fields);
  if (id === 'accountant') ctx.rules = useWorkflowRuns.getState().rules;
  const run = newRun(wf, localUniqueId('wf'), ctx);
  return { runId: run.id, done: advance(wf, run, depsFor(wf)) };
}

/** The titles of a job's steps, in order (empty when the job is gone). */
export const stepTitles = (workflowId: string): string[] => workflowById(workflowId)?.steps.map((s) => s.title) ?? [];

export const answerRun = (run: AnyRun, answers: Record<string, string>): Promise<AnyRun> => answer(workflowFor(run), run, { answers, deps: depsFor(workflowFor(run)) });
export const approveRun = (run: AnyRun): Promise<AnyRun> => approve(workflowFor(run), run, depsFor(workflowFor(run)));
export const cancelRun = (run: AnyRun): void => save(cancel(run));
/** Carries on a run that was left waiting or interrupted (the app was closed mid-step). */
export const resumeRun = (run: AnyRun): Promise<AnyRun> => (run.status === 'running' || run.status === 'failed') ? advance(workflowFor(run), run, depsFor(workflowFor(run))) : Promise.resolve(run);
