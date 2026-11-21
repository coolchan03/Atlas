/**
 * "Verify": finds the calculations written in a reply ("500 * 0.2 = 100") and recomputes them in code, so a confident-looking
 * wrong sum is caught without asking the same model "are you sure?". It checks arithmetic only. It says nothing about whether the
 * right formula was used or whether a source supports a rule, and it says so. Pure.
 */
import { Alert } from 'react-native';
import { evaluateExpression } from '../utils/arithmetic';

export interface CalcCheck { expression: string; claimed: number; computed: number; ok: boolean; /** Matches once rounded to the number of decimals the reply wrote. */ roundedOk: boolean }

const NUMBER = String.raw`\(?\$?-?\d[\d,]*(?:\.\d+)?%?\)?`;
// "<number> <op> <number> ... = <number>" on one line; ops: + - * / x × ÷ ^
const LINE = new RegExp(String.raw`((?:${NUMBER}\s*[-+*/x×÷^]\s*)+${NUMBER})\s*=\s*(${NUMBER})`, 'g');

const toNumber = (s: string): number => {
  const neg = /^\(.*\)$/.test(s.trim()) || s.includes('-');
  const n = Number(s.replace(/[$,()%\s-]/g, ''));
  return neg ? -n : n;
};

/** Every "a op b = c" in the text, recomputed. Percent signs are treated as /100 on that number. */
export function findCalculations(text: string): CalcCheck[] {
  const out: CalcCheck[] = [];
  for (const m of text.replace(/−/g, '-').matchAll(LINE)) {
    const expression = m[1].trim();
    const claimedText = m[2].trim();
    try {
      const evaluable = expression.replace(/[x×]/g, '*').replace(/÷/g, '/').replace(/\$/g, '').replace(/,/g, '').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)').replace(/\(\s*-/g, '(0-').replace(/--/g, '+');
      const computed = evaluateExpression(evaluable);
      const claimed = claimedText.endsWith('%') ? toNumber(claimedText) / 100 : toNumber(claimedText);
      if (!Number.isFinite(computed) || !Number.isFinite(claimed)) continue;
      const decimals = (claimedText.split('.')[1] ?? '').replace(/\D/g, '').length;
      const tol = Math.max(1e-9, Math.abs(computed) * 1e-9);
      const ok = Math.abs(computed - claimed) <= tol;
      const factor = 10 ** (claimedText.endsWith('%') ? decimals + 2 : decimals);
      const roundedOk = ok || Math.round(computed * factor) / factor === Math.round(claimed * factor) / factor;
      out.push({ expression, claimed, computed, ok, roundedOk });
    } catch { /* not arithmetic this evaluator can read: skipped, never guessed */ }
  }
  return out.slice(0, 20);
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6))));

/** The text of the result: what was recomputed, what matched, and what this check cannot tell. Null when the reply has no calculation. */
export function describeChecks(checks: CalcCheck[]): string | null {
  if (!checks.length) return null;
  const lines = checks.map((c) => (c.ok ? `Matches: ${c.expression} = ${fmt(c.computed)}`
    : c.roundedOk ? `Matches after rounding: ${c.expression} = ${fmt(c.computed)} (the reply wrote ${fmt(c.claimed)})`
      : `Does not match: ${c.expression} = ${fmt(c.computed)}, but the reply says ${fmt(c.claimed)}`));
  return `${lines.join('\n')}\n\nThis only recomputes the arithmetic. It does not show that the right formula or rule was used.`;
}

/** Shows the recomputed calculations of a reply, with a way to also ask the AI. Returns false (and shows nothing) when there is no calculation to check. */
export function showCodeCheck(text: string, askModel: () => void): boolean {
  const message = describeChecks(findCalculations(text));
  if (!message) return false;
  Alert.alert('Calculations checked in code', message, [{ text: 'OK', style: 'cancel' }, { text: 'Also ask the AI to check', onPress: askModel }]);
  return true;
}
