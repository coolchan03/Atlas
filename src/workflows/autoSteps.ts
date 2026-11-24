/**
 * A job with several parts, or a long text, done in small steps without the person writing a helper: the job is planned into short steps
 * (planner.ts) and each step is done on its own with a prompt held to the model's budget (stepPrompt.ts), the latest result handed on in
 * full and older ones cut short. The chat model calls this as a tool (work_in_steps) when a request is too big to do well in one go.
 */
import { askModel } from '../study/engine';
import { parseSteps } from './customHelpers';
import { planJob } from './planner';
import { currentStepBudget, STEP_SYSTEM, stepPrompt } from './stepPrompt';

const MAX_RESULT_CHARS = 6000;

/** Plans and does the job. Returns the last step's result, with the steps that were done listed above it. */
export async function workInSteps(job: string, text: string): Promise<string> {
  const steps = parseSteps(await planJob(job)).steps.flatMap((s) => (s.kind === 'ai' ? [s.text] : []));
  if (steps.length < 2) throw new Error('The job could not be split into steps.');
  const material = text.trim() || job;
  const results: string[] = [];
  for (const instruction of steps) {
    const reply = (await askModel(STEP_SYSTEM, stepPrompt({ instruction, text: material, known: '', results, budget: currentStepBudget() }))).trim();
    if (!reply) throw new Error(`The AI gave no answer for the step "${instruction}".`);
    results.push(reply.slice(0, MAX_RESULT_CHARS));
  }
  const done = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `Done in ${steps.length} steps:\n${done}\n\nFinal result:\n${results[results.length - 1]}`;
}
