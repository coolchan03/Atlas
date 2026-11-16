/**
 * A worked example the learner takes part in: before each step is shown they write what they think it is, then see the step and how close
 * they were. "Close" is a plain word-overlap check (it cannot judge reasoning, only that the key words are there), so it only ever says
 * "you had the main idea" or "compare it with the step", never "wrong". Pure, so it is tested without a device.
 */
const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'for', 'then', 'into', 'are', 'was', 'will', 'its', 'our', 'your', 'their', 'have', 'has', 'been', 'which', 'when', 'what', 'each', 'both', 'than', 'also', 'but', 'not', 'you', 'can', 'use', 'now']);
const wordsOf = (t: string): Set<string> => new Set((t.toLowerCase().match(/[a-z0-9$%.]{3,}/g) ?? []).map((w) => w.replace(/[.,]+$/, '').replace(/(ing|ed|es|s)$/, '')).filter((w) => w.length >= 3 && !STOP.has(w)));

/** The share (0 to 1) of the step's key words that the attempt used. */
export function stepOverlap(attempt: string, step: string): number {
  const want = wordsOf(step);
  if (!want.size) return 0;
  const got = wordsOf(attempt);
  let hit = 0;
  want.forEach((w) => { if (got.has(w)) hit++; });
  return hit / want.size;
}

export const CLOSE = 0.3;
/** What to tell the learner after they see a step they tried. */
export const stepFeedback = (attempt: string, step: string): 'close' | 'compare' | 'skipped' => (!attempt.trim() ? 'skipped' : stepOverlap(attempt, step) >= CLOSE ? 'close' : 'compare');
