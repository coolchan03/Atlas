/**
 * Runs the same prompts through two engines on this phone and turns the measurements into an EngineRun for compareEngines
 * (engineBenchmark.ts). The engines are passed in, so this is tested without a model; the screen supplies llama.rn and GenieX.
 */
import { MIN_RUNS, type EngineRun } from './engineBenchmark';

export interface EngineHandle {
  engine: string;
  /** Loads the model (cold) and returns the seconds it took. */
  load: () => Promise<number>;
  /** Writes one reply and reports the engine's own speeds and the time to the first token. */
  reply: (prompt: string) => Promise<{ ttftSec: number; prefillTps: number; decodeTps: number }>;
  /** Peak extra memory in MB while it was loaded (0 when the phone does not report it). */
  peakRamMB: () => Promise<number>;
  unload: () => Promise<void>;
  /** What this engine can do, when it differs from the setup's (a candidate that lacks tools or vision says so here). */
  features?: EngineRun['features'];
}
export interface Setup { device: string; model: string; quant: string; contextLength: number; features: EngineRun['features']; licenceOk: boolean; integrationDays?: number }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Measures one engine over `prompts` (each run once per round, `rounds` times), unloading it afterwards even on a failure. */
export async function measureEngine(handle: EngineHandle, setup: Setup, plan: { prompts: string[]; rounds?: number }): Promise<EngineRun> {
  const { prompts, rounds = 1 } = plan;
  const prefill: number[] = []; const decode: number[] = []; const first: number[] = [];
  let coldLoadSec = 0; let peak = 0;
  try {
    coldLoadSec = await handle.load();
    for (let r = 0; r < rounds; r += 1) {
      for (const prompt of prompts) {
        const x = await handle.reply(prompt);
        if (x.decodeTps > 0) { decode.push(x.decodeTps); prefill.push(x.prefillTps); first.push(x.ttftSec); }
      }
    }
    peak = await handle.peakRamMB();
  } finally { await handle.unload().catch(() => undefined); }
  if (!decode.length) throw new Error(`${handle.engine} produced no measurable reply.`);
  return {
    engine: handle.engine, device: setup.device, model: setup.model, quant: setup.quant, contextLength: setup.contextLength,
    prefillTps: median(prefill), decodeTps: median(decode), coldLoadSec, firstTokenSec: median(first), peakRamMB: peak, runs: decode.length,
    features: handle.features ?? setup.features, licenceOk: setup.licenceOk, integrationDays: setup.integrationDays,
  };
}

/** The number of replies needed for a result rather than a sample: at least MIN_RUNS per engine. */
export const roundsNeeded = (prompts: number): number => Math.max(1, Math.ceil(MIN_RUNS / Math.max(1, prompts)));
