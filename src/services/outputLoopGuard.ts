/**
 * Bounded, engine-independent detector for a decoder stuck in a repetitive cycle.
 * It operates on the visible answer deltas (never on user prompts, reasoning or tools),
 * carries state across tokens, and deliberately tolerates normal markdown/code syntax.
 * Detection is a failure condition, not a content or safety filter.
 */
export type OutputLoopReason = 'repeated-character' | 'repeated-pattern';

export class OutputLoopGuard {
  private tail = '';
  private seen = 0;
  private reason: OutputLoopReason | null = null;

  observe(delta: string): OutputLoopReason | null {
    if (this.reason || !delta) return this.reason;
    this.seen += delta.length;
    this.tail = (this.tail + delta).slice(-512);
    // A short repetition may be intentional (e.g. a divider or emoticon).
    // A run of 48 @ symbols is never useful output from a chat model.
    const special = this.tail.match(/@{48,}$/u);
    if (special) return (this.reason = 'repeated-character');
    // Other single-character loops need a higher threshold to avoid code and art.
    const single = this.tail.match(/([^\s])\1{95,}$/u);
    if (single) return (this.reason = 'repeated-character');
    // E.g. "@ @ @ ...", "the the the ...", "something\n" over and over.
    // Require a large repeated suffix so normal prose and list formatting pass.
    if (this.tail.length < 160 || this.seen < 160) return null;
    for (let width = 2; width <= 48; width++) {
      const motif = this.tail.slice(-width);
      if (!motif.trim()) continue;
      const repeats = Math.max(8, Math.ceil(160 / width));
      if (repeats * width > this.tail.length) continue;
      if (this.tail.endsWith(motif.repeat(repeats))) {
        return (this.reason = 'repeated-pattern');
      }
    }
    return null;
  }
  get tripped(): boolean { return this.reason !== null; }
}

export const OUTPUT_LOOP_ERROR =
  'Atlas stopped a repetitive-output loop. This is a model/runtime generation issue, ' +
  'not a refusal. The partial reply was preserved. Retry the turn; if it happens again, ' +
  'check the model/tokenizer files and try a different sampling setting. Your chosen accelerator was not changed.';
