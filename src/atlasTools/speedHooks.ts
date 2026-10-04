import { recordSpeed } from './speed';

/** Feed llama.rn's own timings (completion result) into the per-model speed memory. */
export function recordLlamaTimings(cr: any, fallbackDecode?: number): void {
  try {
    const t = cr?.timings;
    recordSpeed({
      decode: t?.predicted_per_second || fallbackDecode,
      prefill: t?.prompt_per_second,
      promptTokens: t?.prompt_n,
      outLen: t?.predicted_n,
    });
  } catch { /* best-effort */ }
}
