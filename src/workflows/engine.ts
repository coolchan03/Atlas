/**
 * A small engine for multi-step jobs. A workflow is a fixed list of steps; the person sees each step and approves
 * the ones that matter. Four kinds of step:
 *   code     plain deterministic work (parsing, arithmetic, writing a file)
 *   model    ask the AI; its answer is checked by code before it is used
 *   ask      stop and ask the person something, then carry on with the answers
 *   confirm  show the result and wait for approval
 * The state of a run is plain data, saved after every step, so a run survives the app being closed. The engine
 * holds no screen code; a screen shows `waiting` and sends the person's answers back.
 */
export interface Question { id: string; text: string; options?: string[]; answer?: string }
export type Step<C> =
  | { kind: 'code'; id: string; title: string; run: (ctx: C) => Partial<C> | Promise<Partial<C>> }
  | { kind: 'model'; id: string; title: string; run: (ctx: C, ask: Ask) => Partial<C> | Promise<Partial<C>> }
  | { kind: 'ask'; id: string; title: string; questions: (ctx: C) => Question[]; apply: (ctx: C, answers: Record<string, string>) => Partial<C> }
  | { kind: 'confirm'; id: string; title: string; summary: (ctx: C) => string };
export type Ask = (system: string, user: string) => Promise<string>;
export interface Workflow<C> { id: string; title: string; summary: string; steps: Step<C>[] }

export type RunStatus = 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';
export interface Waiting { kind: 'ask' | 'confirm'; stepId: string; title: string; questions?: Question[]; summary?: string }
export interface Run<C> {
  id: string;
  workflowId: string;
  ctx: C;
  /** Index of the step to run next. */
  step: number;
  status: RunStatus;
  waiting?: Waiting;
  error?: string;
  /** One line per finished step, for the screen. */
  log: string[];
  startedAt: number;
}

export const newRun = <C>(workflow: Workflow<C>, id: string, ctx: C, now = Date.now()): Run<C> =>
  ({ id, workflowId: workflow.id, ctx, step: 0, status: 'running', log: [], startedAt: now });

/** Runs steps until one needs the person, the job is done, or a step fails. Returns the new state; never throws. */
export async function advance<C>(workflow: Workflow<C>, run: Run<C>, ask: Ask, save: (r: Run<C>) => void = () => undefined): Promise<Run<C>> {
  let state: Run<C> = { ...run, status: 'running', waiting: undefined, error: undefined };
  while (state.step < workflow.steps.length) {
    const step = workflow.steps[state.step];
    try {
      if (step.kind === 'ask') {
        const questions = step.questions(state.ctx);
        if (questions.length) { state = { ...state, status: 'waiting', waiting: { kind: 'ask', stepId: step.id, title: step.title, questions } }; save(state); return state; }
        state = { ...state, step: state.step + 1, log: [...state.log, `${step.title}: nothing to ask`] };
      } else if (step.kind === 'confirm') {
        state = { ...state, status: 'waiting', waiting: { kind: 'confirm', stepId: step.id, title: step.title, summary: step.summary(state.ctx) } };
        save(state);
        return state;
      } else {
        const patch = await step.run(state.ctx, ask);
        state = { ...state, ctx: { ...state.ctx, ...patch }, step: state.step + 1, log: [...state.log, `${step.title}: done`] };
      }
      save(state);
    } catch (e) {
      state = { ...state, status: 'failed', error: `${step.title}: ${e instanceof Error ? e.message : String(e)}` };
      save(state);
      return state;
    }
  }
  state = { ...state, status: 'done', waiting: undefined };
  save(state);
  return state;
}

/** Gives the person's answers to the waiting `ask` step and carries on. */
export function answer<C>(workflow: Workflow<C>, run: Run<C>, answers: Record<string, string>, ask: Ask, save?: (r: Run<C>) => void): Promise<Run<C>> {
  const step = workflow.steps[run.step];
  if (run.status !== 'waiting' || step?.kind !== 'ask') return Promise.resolve(run);
  const patch = step.apply(run.ctx, answers);
  return advance(workflow, { ...run, ctx: { ...run.ctx, ...patch }, step: run.step + 1, log: [...run.log, `${step.title}: answered`] }, ask, save);
}

/** Approves the waiting `confirm` step and carries on. */
export function approve<C>(workflow: Workflow<C>, run: Run<C>, ask: Ask, save?: (r: Run<C>) => void): Promise<Run<C>> {
  const step = workflow.steps[run.step];
  if (run.status !== 'waiting' || step?.kind !== 'confirm') return Promise.resolve(run);
  return advance(workflow, { ...run, step: run.step + 1, log: [...run.log, `${step.title}: approved`] }, ask, save);
}

export const cancel = <C>(run: Run<C>): Run<C> => ({ ...run, status: 'cancelled', waiting: undefined });

/** The first JSON object or array in a model's reply, or null. Models wrap JSON in prose and code fences. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const starts = ['{', '['].map((open) => ({ open, at: cleaned.indexOf(open) })).filter((s) => s.at >= 0).sort((x, y) => x.at - y.at);
  for (const { open, at } of starts) {
    const close = open === '{' ? '}' : ']';
    for (let end = cleaned.lastIndexOf(close); end > at; end = cleaned.lastIndexOf(close, end - 1)) {
      try { return JSON.parse(cleaned.slice(at, end + 1)); } catch { /* try a shorter slice */ }
    }
  }
  return null;
}
