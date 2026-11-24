/**
 * The chat's side of "big requests in steps": plans and does the request (autoSteps.ts) while saying what it is doing, then gives back what
 * the model is shown in place of the message, which carries the work so the model only has to write the answer. The saved message is never changed.
 * A job that fails is not an error for the person: the chat answers the message as it always did.
 */
import logger from '../utils/logger';
import { StepsCancelledError, workInSteps } from './autoSteps';
import { fitsWhole } from './longText';
import { currentStepBudget } from './stepPrompt';
import { useStepProgress } from './stepProgress';

export interface StepsHooks {
  /** What is being done now, for the line above the message box (null when finished). */
  onStatus: (status: string | null) => void;
  /** A line for the chat saying what was done. */
  addNote: (text: string) => void;
}

/** The first and last of a long message, where the request usually is, for planning. */
const jobOf = (message: string): string => (message.length > 500 ? `${message.slice(0, 250)} ... ${message.slice(-250)}` : message);

/** The text for the model in place of the message, or null when the job could not be done (the message is then answered as it is). Rethrows a stop. */
export async function answerInSteps(message: string, hooks: StepsHooks): Promise<string | null> {
  const unsubscribe = useStepProgress.subscribe((s) => {
    if (!s.active) return;
    const total = s.items.length;
    const at = s.items.findIndex((i) => i.state === 'running');
    hooks.onStatus(at < 0 ? 'Doing this in steps...' : `Doing this in steps (${at + 1} of ${total}): ${s.items[at].note ?? s.items[at].label}`);
  });
  try {
    const done = await workInSteps(jobOf(message), message);
    const listed = /^Done in (\d+) steps:\n([\s\S]*?)\n\nFinal result:/.exec(done);
    if (listed) hooks.addNote(`Did this in ${listed[1]} steps:\n${listed[2]}`);
    return fitsWhole(message, currentStepBudget())
      ? `${message}\n\n[This request was done in small steps first. Use that work to write your answer.]\n${done}`
      : `${jobOf(message)}\n\n[The message was long, so it was read in parts and done in small steps. Use that work to write your answer; do not ask for the text again.]\n${done}`;
  } catch (e) {
    if (e instanceof StepsCancelledError) throw e;
    logger.warn(`[ChatGen] could not do the request in steps: ${String((e as Error)?.message ?? e)}`);
    return null;
  } finally {
    unsubscribe();
    hooks.onStatus(null);
  }
}
