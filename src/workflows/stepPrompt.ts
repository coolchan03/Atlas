/**
 * What one step of a helper is shown. A small model is overwhelmed (or runs out of room) when a step is handed everything so far, so each
 * step gets its instruction, a slice of the original text, the answers it was given, and only the latest result in full: older results
 * are cut to their first words. The whole prompt is held to a budget set by the model's context window, and when something must be
 * cut it is the middle of the long text, never the instruction or the latest result.
 */
import { fitPrompt } from '../services/llmJobQueue';

/** Characters a step prompt may use for a context of this many tokens: about a third of the window (4 characters a token), between 2,400 and 12,000. */
export function stepBudget(contextTokens: number): number {
  return Math.max(2400, Math.min(12000, Math.round(Math.max(0, contextTokens) * 4 / 3)));
}

/** The budget for the model that is set up now (4,096 tokens when not known). */
export function currentStepBudget(): number {
  try { return stepBudget(require('../stores/appStore').useAppStore.getState().settings.contextLength || 4096); } catch { return stepBudget(4096); }
}

/** What every step of a helper is told. */
export const STEP_SYSTEM = 'You follow one instruction using only the information given. Never invent facts, names, numbers or dates that are not in it. If something needed is missing, say what is missing.';

const OLDER_RESULT_CHARS = 160;
const MAX_OLDER_RESULTS = 4;

export interface StepInput { instruction: string; text: string; /** Answers and numbers the helper holds ("Tone: Formal", "Total: 57.5"). */ known: string; results: string[]; budget: number }

/** The prompt for one step, never longer than `budget` characters. Pure. */
export function stepPrompt({ instruction, text, known, results, budget }: StepInput): string {
  const head = `Instruction: ${instruction.slice(0, 600)}`;
  const latest = results.length ? results[results.length - 1] : '';
  const older = results.slice(0, -1).slice(-MAX_OLDER_RESULTS).map((r, i, all) => `Step ${results.length - all.length + i} (short): ${r.replace(/\s+/g, ' ').slice(0, OLDER_RESULT_CHARS)}`).join('\n');
  const latestBlock = latest ? `\nResult of the step before:\n${latest.slice(0, Math.round(budget * 0.4))}\n` : '';
  const olderBlock = older ? `\nEarlier steps:\n${older}\n` : '';
  const knownBlock = known ? `\nChoices:\n${known.slice(0, Math.round(budget * 0.12))}\n` : '';
  const fixed = head.length + latestBlock.length + olderBlock.length + knownBlock.length + 12;
  const room = Math.max(300, budget - fixed);
  return `${head}\n\nText:\n${fitPrompt(text, room)}\n${knownBlock}${olderBlock}${latestBlock}`;
}
