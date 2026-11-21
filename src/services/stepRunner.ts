/**
 * "Work through steps": for a request that needs several things done in order, the AI first writes a SHORT plan (at most MAX_STEPS
 * steps), each step runs in turn (a step may use one of the tools the person already switched on for this chat, and nothing else),
 * a failed step is retried a bounded number of times, and the final answer is written only from what the steps actually returned.
 * Progress goes to Task Center and the person can stop it. The model is reached through injected functions, so the whole flow is
 * tested without one. There is no visual workflow editor.
 */
import { withTimeout } from '../utils/withTimeout';

export const MAX_STEPS = 6;
const STEP_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_ATTEMPTS = 2;
/** The most of one step's output that is carried into later steps and the final answer. */
const OUTPUT_CHARS = 1500;

export interface PlanStep { n: number; title: string; /** A tool this step should use, only when it is one the chat has enabled. */ tool?: string; args?: Record<string, string> }
export interface StepResult { n: number; title: string; ok: boolean; output: string; attempts: number; error?: string }

const clip = (t: string, n = OUTPUT_CHARS) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** The planning request. Tools are listed by name only: a step that names any other tool is run as a plain reasoning step. */
function planPrompt(goal: string, tools: string[]): { system: string; user: string } {
  return {
    system: `You break a request into a short ordered plan. Reply with ONLY a JSON array of at most ${MAX_STEPS} steps, each {"title": "what to do", "tool": "optional tool name", "args": {"name": "value"}}. Use a tool only from this list: ${tools.length ? tools.join(', ') : '(none)'}. Do not add steps that are not needed. If the request is simple, reply with one step.`,
    user: `REQUEST: ${goal}`,
  };
}

/** Reads the plan. Null when it is not a usable array (the caller then answers normally). Steps beyond MAX_STEPS are dropped; a tool not enabled is removed from its step. */
export function parsePlan(raw: string, allowedTools: string[]): PlanStep[] | null {
  const start = raw.indexOf('['); const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try { data = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(data)) return null;
  const steps: PlanStep[] = [];
  for (const item of data) {
    if (steps.length >= MAX_STEPS) break;
    const o = item as { title?: unknown; tool?: unknown; args?: unknown };
    const title = typeof o?.title === 'string' ? o.title.trim().slice(0, 140) : '';
    if (!title) continue;
    const tool = typeof o.tool === 'string' && allowedTools.includes(o.tool) ? o.tool : undefined;
    const args = tool && o.args && typeof o.args === 'object' && !Array.isArray(o.args)
      ? Object.fromEntries(Object.entries(o.args as Record<string, unknown>).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)]))
      : undefined;
    steps.push({ n: steps.length + 1, title, ...(tool ? { tool, args } : {}) });
  }
  return steps.length ? steps : null;
}

export interface RunDeps {
  /** Runs one step. Throws on failure. */
  run: (step: PlanStep, earlier: StepResult[]) => Promise<string>;
  shouldStop: () => boolean;
  onProgress?: (done: number, total: number, title: string) => void;
  stepTimeoutMs?: number;
  maxAttempts?: number;
}

/** Runs the steps in order. Stops at the first step that fails all its attempts, or when asked to stop; what ran is returned either way. */
export async function runSteps(steps: PlanStep[], deps: RunDeps): Promise<{ results: StepResult[]; stopped: boolean }> {
  const results: StepResult[] = [];
  const limit = deps.stepTimeoutMs ?? STEP_TIMEOUT_MS;
  for (const step of steps) {
    // A step that uses a tool is never repeated: the first try may still be running, and a tool can change something.
    const attempts = step.tool ? 1 : (deps.maxAttempts ?? MAX_ATTEMPTS);
    if (deps.shouldStop()) return { results, stopped: true };
    deps.onProgress?.(results.length, steps.length, step.title);
    let last = '';
    let output: string | null = null;
    let tried = 0;
    while (tried < attempts && output === null) {
      if (deps.shouldStop()) return { results, stopped: true };
      tried += 1;
      try { output = clip(String(await withTimeout(deps.run(step, results), limit, `Step ${step.n}`))); }
      catch (e: any) { last = String(e?.message || e); }
    }
    results.push(output === null ? { n: step.n, title: step.title, ok: false, output: '', attempts: tried, error: last } : { n: step.n, title: step.title, ok: true, output, attempts: tried });
    if (output === null) break; // later steps would build on a step that did not happen
  }
  return { results, stopped: false };
}

/** The final-answer request: only the steps' own results may be used, and anything that did not run is said plainly. */
export function finalPrompt(goal: string, results: StepResult[], how: { planned: number; stopped: boolean }): { system: string; user: string } {
  const lines = results.map((r) => (r.ok ? `Step ${r.n} (${r.title}) result:\n${r.output}` : `Step ${r.n} (${r.title}) FAILED after ${r.attempts} tries: ${r.error}`));
  const notDone = how.planned - results.length;
  const note = how.stopped ? '\nThe person stopped the work early.' : notDone > 0 ? `\n${notDone} later step${notDone === 1 ? ' was' : 's were'} not run because an earlier step failed.` : '';
  return {
    system: 'Write the final answer to the request using ONLY the step results below. Do not add facts that no step returned. If a step failed or was not run, say what could not be done instead of guessing.',
    user: `REQUEST: ${goal}\n\n${lines.join('\n\n') || '(no step ran)'}${note}`,
  };
}

export interface FlowDeps {
  ask: (system: string, user: string) => Promise<string>;
  /** Runs an enabled tool and returns its text; throws when it fails. */
  tool: (name: string, args: Record<string, string>) => Promise<string>;
  enabledTools: string[];
  shouldStop: () => boolean;
  onProgress?: (done: number, total: number, title: string) => void;
  /** Called once, with the plan, before the first step runs. */
  onPlan?: (plan: PlanStep[]) => void;
  stepTimeoutMs?: number;
}

/** The whole flow. Returns null when no usable plan was made (the caller answers the request the ordinary way). */
export async function workThroughSteps(goal: string, deps: FlowDeps): Promise<{ answer: string; results: StepResult[]; stopped: boolean } | null> {
  const p = planPrompt(goal, deps.enabledTools);
  const plan = parsePlan(await deps.ask(p.system, p.user), deps.enabledTools);
  if (!plan) return null;
  deps.onPlan?.(plan);
  const { results, stopped } = await runSteps(plan, {
    shouldStop: deps.shouldStop, onProgress: deps.onProgress, stepTimeoutMs: deps.stepTimeoutMs,
    run: async (step, earlier) => {
      if (step.tool) return deps.tool(step.tool, step.args ?? {}); // an enabled tool, with the plan's own arguments
      const carried = earlier.filter((r) => r.ok).map((r) => `Step ${r.n}: ${r.output}`).join('\n');
      return deps.ask('Do this one step of a larger task. Reply with the result only.', `OVERALL REQUEST: ${goal}\n${carried ? `\nEARLIER RESULTS:\n${carried}\n` : ''}\nTHIS STEP: ${step.title}`);
    },
  });
  const f = finalPrompt(goal, results, { planned: plan.length, stopped });
  return { answer: (await deps.ask(f.system, f.user)).trim(), results, stopped };
}
