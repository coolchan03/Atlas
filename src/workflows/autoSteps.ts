/**
 * A job with several parts, or a long text, done in small steps without the person writing a helper: the job is planned into short steps
 * (planner.ts) and each step is done on its own with a prompt held to the model's budget (stepPrompt.ts), the latest result handed on in
 * full and older ones cut short. The chat model calls this as a tool (work_in_steps) when a request is too big to do well in one go.
 */
import { askShaped } from '../study/engine';
import { parseSteps } from './customHelpers';
import { digestText } from './longText';
import { planJob } from './planner';
import { currentStepBudget, STEP_SYSTEM, stepPrompt } from './stepPrompt';

const MAX_RESULT_CHARS = 6000;
/** The longest one step may write, in tokens. */
const STEP_TOKENS = 900;
/** The longest a part's notes may be, in tokens. */
const NOTES_TOKENS = 350;

/**
 * Plans and does the job. A long text is first read in parts and written down as notes (longText.ts), so no part of it is dropped; the steps
 * then work from the notes. Returns the last step's result, with the steps that were done listed above it. `onStep` hears what is being done.
 */
export async function workInSteps(job: string, text: string, onStep: (what: string) => void = () => undefined): Promise<string> {
  const budget = currentStepBudget();
  const steps = parseSteps(await planJob(job)).steps.flatMap((s) => (s.kind === 'ai' ? [s.text] : []));
  if (steps.length < 2) throw new Error('The job could not be split into steps.');
  const material = await digestText(job, text.trim() || job, {
    budget,
    ask: (system, user, label) => { onStep(label); return askShaped(system, user, { label, maxTokens: NOTES_TOKENS }); },
  });
  const results: string[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const label = `Step ${i + 1} of ${steps.length}`;
    onStep(label);
    const prompt = stepPrompt({ instruction: steps[i], text: material, known: '', results, budget });
    const reply = (await askShaped(STEP_SYSTEM, prompt, { label, maxTokens: STEP_TOKENS })).trim();
    if (!reply) throw new Error(`The AI gave no answer for the step "${steps[i]}".`);
    results.push(reply.slice(0, MAX_RESULT_CHARS));
  }
  const done = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `Done in ${steps.length} steps:\n${done}\n\nFinal result:\n${results[results.length - 1]}`;
}
