/**
 * "Plan it for me": a small model breaks a big job into two to six short steps, so that each step can be done alone with little to read.
 * Its answer is held to a grammar (numbered lines of plain words), so it cannot ramble, skip numbers or write more than six steps.
 * The person reads and edits the steps before anything runs.
 */
import { askShaped } from '../study/engine';
import { parseSteps } from './customHelpers';

/** One plain sentence of words (no digits, so a step cannot start a numbered list of its own), ended by a full stop. */
const LINE = '[A-Za-z ,\'()/%$-]{12,110}';

/** "1. text" up to "6. text", at least two. */
function planGrammar(): string {
  return [`root ::= "1. " line "2. " line ("3. " line ("4. " line ("5. " line ("6. " line)?)?)?)?`, `line ::= ${LINE} ".\\n"`].join('\n');
}

// No worked example on purpose: small models copy an example's steps instead of planning the job in front of them.
const SYSTEM = `You break a job into 2 to 6 short steps for a small AI that does one step at a time. Each step is one clear instruction that a small AI can do alone, using the text and the results of the steps before it. The steps are done in order, and the last step gives the final answer. Reply with only the numbered steps, one short sentence each.
Use the words of the job in the steps. Do not add steps the job does not need.`;

/** The steps for a job, as numbered lines the helper reader accepts. Throws a plain sentence when the answer cannot be used. */
export async function planJob(job: string): Promise<string> {
  const reply = (await askShaped(SYSTEM, `Job: ${job.trim().slice(0, 500)}\nSteps:`, { label: 'Planning the steps', maxTokens: 320, grammar: planGrammar() })).trim();
  const lines = reply.split('\n').map((l) => l.trim()).filter(Boolean);
  if (parseSteps(lines.join('\n')).errors.length || lines.length < 2) throw new Error('The AI did not write usable steps. Try again, or write them yourself.');
  return lines.join('\n');
}
