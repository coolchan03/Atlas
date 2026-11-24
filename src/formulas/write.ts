/**
 * The AI writes the formula; code checks it. The reply is held to one line starting with "=", then read by the evaluator on the
 * person's own sample values. A formula that cannot be read gets one more try with the reason; one that still fails is shown as failed,
 * never as an answer.
 */
import { askShaped } from '../study/engine';
import { evaluateFormula, FORMULA_FUNCTIONS, type Cell, type Grid } from './evaluate';

const GRAMMAR = 'root ::= "=" [^\\n]{2,200}';
const SYSTEM = `You write one spreadsheet formula. The sheet has the columns and sample rows you are shown; column A is the first column and row 1 is the first line. Answer with a single line that starts with = and nothing else. Use only these functions: ${FORMULA_FUNCTIONS.join(', ')}.`;

export interface FormulaResult { formula: string; value: Cell; ok: true }
export interface FormulaFailure { formula: string; error: string; ok: false }

const preview = (grid: Grid) => grid.slice(0, 6).map((r, i) => `${i + 1}: ${r.map((c) => (c === null ? '' : String(c))).join(' | ')}`).join('\n');

/** The formula for a request, tried on the sample grid. */
export async function writeFormula(request: string, grid: Grid, ask: typeof askShaped = askShaped): Promise<FormulaResult | FormulaFailure> {
  const first = `Sample rows (columns A, B, C ... separated by |):\n${preview(grid)}\n\nWhat the formula must do: ${request.trim().slice(0, 400)}\nFormula:`;
  let formula = (await ask(SYSTEM, first, { label: 'Writing a formula', maxTokens: 120, grammar: GRAMMAR })).trim().split('\n')[0];
  let tried = evaluateFormula(formula, grid);
  if (!tried.ok) {
    formula = (await ask(SYSTEM, `${first} ${formula}\nThat formula failed: ${tried.error}\nWrite it again.\nFormula:`, { label: 'Writing a formula', maxTokens: 120, grammar: GRAMMAR })).trim().split('\n')[0];
    tried = evaluateFormula(formula, grid);
  }
  return tried.ok ? { formula, value: tried.value, ok: true } : { formula, error: tried.error, ok: false };
}
