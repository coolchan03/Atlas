/**
 * How long one lesson call may take before it is stopped. A fixed few minutes failed on slow phones that were still writing (a lesson is
 * a couple of thousand tokens: at 3 tokens a second that is over ten minutes), so the limit follows the speed measured for the model in
 * use, with a margin, never under the base limit and never past half an hour. Pure.
 */
const BASE_MS = 4 * 60 * 1000;
const MAX_MS = 30 * 60 * 1000;
const LESSON_TOKENS = 2200; // a typical lesson's JSON, at least
const PROMPT_TOKENS = 3500; // the sources and instructions it reads first
const MARGIN = 1.6;

export interface MeasuredSpeed { decode: number; prefill: number; outLen: number }

export function callLimitMs(speed?: Partial<MeasuredSpeed>): number {
  const decode = speed?.decode && speed.decode > 0 ? speed.decode : 6;
  const prefill = speed?.prefill && speed.prefill > 0 ? speed.prefill : 60;
  const out = Math.max(LESSON_TOKENS, speed?.outLen ?? 0);
  const ms = (out / decode + PROMPT_TOKENS / prefill) * MARGIN * 1000;
  return Math.round(Math.min(MAX_MS, Math.max(BASE_MS, ms)));
}
