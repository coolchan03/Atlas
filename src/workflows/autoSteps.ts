/**
 * A job with several parts, or a long text, done in small steps without the person writing a helper: the job is planned into short steps
 * (planner.ts) and each step is done on its own with a prompt held to the model's budget (stepPrompt.ts), the latest result handed on in
 * full and older ones cut short. The chat model calls this as a tool (work_in_steps) when a request is too big to do well in one go.
 */
import { askShaped } from '../study/engine';
import { parseSteps } from './customHelpers';
import { digestText, fitsWhole } from './longText';
import { planJob } from './planner';
import { useStepProgress } from './stepProgress';
import { relevantReferences } from '../skills/selectSkills';
import type { SkillResource } from '../skills/parseSkill';
import { currentStepBudget, STEP_SYSTEM, stepPrompt } from './stepPrompt';

const MAX_RESULT_CHARS = 6000;

/** Thrown when the person pressed Stop while a job was being done in steps. */
export class StepsCancelledError extends Error { constructor() { super('Stopped'); this.name = 'StepsCancelledError'; } }
let cancelled = false;
/** Stops the job being done in steps: it ends before its next model call. */
export function cancelWorkInSteps(): void { cancelled = true; }
const check = (): void => { if (cancelled) throw new StepsCancelledError(); };
/** The longest one step may write, in tokens. */
const STEP_TOKENS = 900;
/** The longest a part's notes may be, in tokens. */
const NOTES_TOKENS = 350;

/**
 * Plans and does the job. A long text is first read in parts and written down as notes (longText.ts), so no part of it is dropped; the steps
 * then work from the notes. Returns the last step's result, with the steps that were done listed above it. The steps are shown as they run
 * (stepProgress.ts).
 */
export async function workInSteps(job: string, text: string, skill?: { summary: string; steps: string[]; resources?: SkillResource[] }): Promise<string> {
  cancelled = false;
  const progress = useStepProgress.getState();
  const budget = currentStepBudget();
  progress.begin(['Plan the steps']);
  try {
    // An installed skill brings its own steps; otherwise the AI plans them.
    const steps = skill ? skill.steps : parseSteps(await planJob(job)).steps.flatMap((s) => (s.kind === 'ai' ? [s.text] : []));
    if (steps.length < 2) throw new Error('The job could not be split into steps.');
    const material = text.trim() || job;
    const reads = !fitsWhole(material, budget);
    // The plan is done; the list now shows every step (and the reading, when the text is long) with the first one running.
    const offset = reads ? 1 : 0;
    progress.begin([...(reads ? ['Read the text in parts'] : []), ...steps]);
    const notes = await digestText(job, material, {
      budget,
      ask: (system, user, label) => { check(); progress.mark(0, 'running', label); return askShaped(system, user, { label, maxTokens: NOTES_TOKENS }); },
    });
    if (reads) progress.mark(0, 'done');
    const results: string[] = [];
    for (let i = 0; i < steps.length; i += 1) {
      const label = `Step ${i + 1} of ${steps.length}`;
      check();
      progress.mark(i + offset, 'running', label);
      const references = skill?.resources?.length ? relevantReferences(`${steps[i]} ${job} ${skill.summary}`, skill.resources, Math.round(budget * 0.25)) : [];
      const prompt = stepPrompt({ instruction: steps[i], text: notes, known: '', results, budget, references });
      const reply = (await askShaped(STEP_SYSTEM, prompt, { label, maxTokens: STEP_TOKENS })).trim();
      if (!reply) throw new Error(`The AI gave no answer for the step "${steps[i]}".`);
      check();
      results.push(reply.slice(0, MAX_RESULT_CHARS));
      progress.mark(i + offset, 'done');
    }
    const done = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    return `Done in ${steps.length} steps:\n${done}\n\nFinal result:\n${results[results.length - 1]}`;
  } finally { progress.end(); }
}
