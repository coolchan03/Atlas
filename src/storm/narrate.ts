/**
 * The storm risk in plain words. The level and the numbers come from risk.ts; the AI writes two sentences about them, and the
 * sentences are checked: no number that is not in the facts, nothing that calls a calm day dangerous, nothing that calms a warning.
 * When the check fails the fixed advice for the level is used on its own.
 */
import { askShaped } from '../study/engine';
import { ADVICE, LEVEL_NAME, type StormRisk } from './risk';

const SYSTEM = `You explain a barometer reading to a hiker in two plain sentences. You are given the risk level and the pressure change. Say what the change means for the weather in the next few hours. Use only the numbers given. Do not give a forecast with times or amounts of rain, and do not change the risk level.`;

const num = (n: number | null) => (n === null ? 'not known' : `${n >= 0 ? '+' : ''}${n.toFixed(1)} hPa`);

/** The facts the AI is shown. Pure. */
function stormFacts(risk: StormRisk): string {
  return `Risk level: ${LEVEL_NAME[risk.level]}\nPressure change over 3 hours: ${num(risk.change3h)}\nPressure change over the last hour: ${num(risk.change1h)}\nPressure now: ${risk.hpa === null ? 'not known' : `${risk.hpa} hPa`}`;
}

/** True when the sentences keep to the facts and agree with the level. Pure. */
function narrationFits(text: string, risk: StormRisk): boolean {
  const t = text.trim();
  if (t.length < 20 || t.length > 400) return false;
  const allowed = new Set((stormFacts(risk).match(/\d+(?:\.\d+)?/g) ?? []).flatMap((n) => [n, String(Number(n)), String(Math.round(Number(n)))]));
  allowed.add('3'); allowed.add('1'); allowed.add('2');
  for (const n of t.match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n) && !allowed.has(String(Number(n)))) return false;
  const alarming = /\b(storm|danger\w*|severe|shelter|violent)\b/i.test(t);
  const soothing = /\b(no need to worry|nothing to worry|safe|clear skies|all clear)\b/i.test(t);
  if (risk.level === 'calm' && alarming) return false;
  if ((risk.level === 'warning' || risk.level === 'storm') && soothing) return false;
  return true;
}

/** Two sentences in plain words about the risk, or the fixed advice when the AI's words do not fit. */
export async function narrateStorm(risk: StormRisk, ask: typeof askShaped = askShaped): Promise<{ text: string; fromAi: boolean }> {
  if (risk.level === 'learning' || risk.level === 'unclear') return { text: ADVICE[risk.level], fromAi: false };
  try {
    const out = (await ask(SYSTEM, `${stormFacts(risk)}\n\nTwo sentences:`, { label: 'Explaining the pressure', maxTokens: 120 })).trim();
    if (narrationFits(out, risk)) return { text: out, fromAi: true };
  } catch { /* the fixed advice below */ }
  return { text: ADVICE[risk.level], fromAi: false };
}
