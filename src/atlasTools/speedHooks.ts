import { recordSpeed } from './speed';
import { useSpecBenefit } from './specBenefit';
import { useAppStore } from '../stores/appStore';

/** How much of the last prompt the engine did not have to read again (its cache already held the start of it). */
export interface PromptReuse { promptTokens: number; processedTokens: number; reusedTokens: number }
let lastReuse: PromptReuse | null = null;

/** The reuse seen by the last completion, or null when the engine did not report it. Lessons are written as an outline, then pieces, then a finish: each should start from the same cached opening. */
export const lastPromptReuse = (): PromptReuse | null => lastReuse;

/** ", prompt P tokens, R reused from the cache" for a log line, or nothing when the engine reported none. */
export function reuseNote(): string {
  const r = lastReuse;
  return r ? `, prompt ${r.promptTokens} tokens (${r.reusedTokens} reused from the cache, ${r.processedTokens} read)` : '';
}

/** Reuse from llama.rn's completion result: the whole prompt (`tokens_evaluated`) against what it actually processed this time (`timings.prompt_n`). Pure. */
export function promptReuseOf(cr: any): PromptReuse | null {
  const total = Number(cr?.tokens_evaluated);
  const processed = Number(cr?.timings?.prompt_n);
  if (!Number.isFinite(total) || !Number.isFinite(processed) || total <= 0 || processed < 0) return null;
  const reused = Math.max(0, total - processed);
  return { promptTokens: total, processedTokens: processed, reusedTokens: reused };
}

/** Feed llama.rn's own timings (completion result) into the per-model speed memory. */
export function recordLlamaTimings(cr: any, fallbackDecode?: number, drafting?: boolean): void {
  try {
    lastReuse = promptReuseOf(cr);
    const t = cr?.timings;
    // A reply of real length, with whether speculative decoding was running, feeds the "does it help on this phone" comparison.
    const decode = t?.predicted_per_second || fallbackDecode;
    if (drafting !== undefined && decode && Number(t?.predicted_n) >= 24) useSpecBenefit.getState().record(useAppStore.getState().activeModelId ?? '', drafting, decode);
    recordSpeed({
      decode: t?.predicted_per_second || fallbackDecode,
      prefill: t?.prompt_per_second,
      promptTokens: t?.prompt_n,
      outLen: t?.predicted_n,
    });
  } catch { /* best-effort */ }
}
