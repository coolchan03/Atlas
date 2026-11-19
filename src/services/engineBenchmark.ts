/**
 * Comparing a candidate text/vision engine (for example GenieX on Snapdragon) with the engine in use, from measurements taken on the same
 * phone, model and prompts. It never recommends replacing an engine from one sample, from a phone the candidate does not support, or when
 * the candidate drops a feature the current engine provides; and it never assumes a text engine speeds up image generation. Pure.
 */
export interface EngineRun {
  engine: string;
  device: string;
  /** Model file name and quantization, so only like is compared with like. */
  model: string;
  quant: string;
  contextLength: number;
  /** Tokens per second reading the prompt, and writing the answer. */
  prefillTps: number;
  decodeTps: number;
  /** Cold start (process and model load) and warm (already loaded) first-token delay, in seconds. */
  coldLoadSec: number;
  firstTokenSec: number;
  peakRamMB: number;
  /** Replies measured; a figure from fewer than MIN_RUNS is a sample, not a result. */
  runs: number;
  features: { vision: boolean; tools: boolean; mtp: boolean; qLegacy: boolean };
  licenceOk: boolean;
  /** Rough days of work to wire the engine in (an estimate, entered by a person). */
  integrationDays?: number;
}

export const MIN_RUNS = 5;
export interface Comparison { verdict: 'replace' | 'keep' | 'not-comparable' | 'need-more-runs'; reasons: string[]; speedup?: { decode: number; prefill: number } }

const same = (a: EngineRun, b: EngineRun) => a.device === b.device && a.model === b.model && a.quant === b.quant && a.contextLength === b.contextLength;

export function compareEngines(current: EngineRun, candidate: EngineRun, margin = 1.25): Comparison {
  if (!same(current, candidate)) return { verdict: 'not-comparable', reasons: ['The two runs are not on the same phone, model, quantization and context length.'] };
  if (Math.min(current.runs, candidate.runs) < MIN_RUNS) return { verdict: 'need-more-runs', reasons: [`Each engine needs at least ${MIN_RUNS} measured replies (it has ${Math.min(current.runs, candidate.runs)}).`] };
  const reasons: string[] = [];
  if (!candidate.licenceOk) reasons.push('Licence not confirmed for this use.');
  const lost = (Object.keys(current.features) as Array<keyof EngineRun['features']>).filter((f) => current.features[f] && !candidate.features[f]);
  if (lost.length) reasons.push(`Drops what the current engine does: ${lost.join(', ')}.`);
  if (candidate.peakRamMB > current.peakRamMB * 1.25) reasons.push(`Uses much more memory (${Math.round(candidate.peakRamMB)} MB against ${Math.round(current.peakRamMB)} MB).`);
  const speedup = { decode: candidate.decodeTps / current.decodeTps, prefill: candidate.prefillTps / current.prefillTps };
  if (speedup.decode < margin && speedup.prefill < margin) reasons.push(`Not clearly faster (writing ${speedup.decode.toFixed(2)}x, reading ${speedup.prefill.toFixed(2)}x; needs ${margin}x on at least one).`);
  return { verdict: reasons.length ? 'keep' : 'replace', reasons: reasons.length ? reasons : ['Faster on the same phone and model with nothing lost, within the memory budget.'], speedup };
}
