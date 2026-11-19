/**
 * Comparing voice engines on the same reference and sentences. The sentences are chosen to expose the known weak spots (a short
 * opening vowel, numbers, long prose); the verdict rule keeps the fast working voice unless a candidate is clearly better AND
 * fast enough for a call. Ratings of naturalness and similarity are entered by a listener (they cannot be computed); time, memory and
 * glitch counts come from the lab's measurements. Pure.
 */
export const COMPARISON_SENTENCES = [
  'I am here.', "I'm sure it will work.", 'I think so.', 'It costs 1,250 dollars, due on March 3rd.',
  'The meeting moved from 9:30 to 11:15, so please call 555-0142 if that is a problem.',
  'When the lease began, the company recorded a liability and a matching right-of-use asset, then reduced the liability each month as payments were made.',
  'Okay. Sure! Why not?', 'Could you say that again, please?',
] as const;

export interface EngineRun {
  engine: string;
  /** Model size on disk, MB. */
  sizeMB: number;
  /** Peak extra RAM while speaking, MB. */
  ramMB: number;
  /** Seconds from request to first audio, median over the sentences. */
  firstAudioSec: number;
  /** Audio seconds produced per second of compute (above 1 keeps up with live speech). */
  realTimeFactor: number;
  /** Listener ratings, 1 (poor) to 5 (excellent). */
  intelligibility: number; naturalness: number; similarity: number;
  /** Sentences with an audible glitch (clicked or clipped opening, stutter, dropped words). */
  glitches: number;
  /** Licence allows this use (checked by the person, not assumed). */
  licenceOk: boolean;
}

export interface Verdict { engine: string; score: number; usableInCalls: boolean; notes: string[] }

/** A call needs the first sound quickly and speech that is produced at least as fast as it is spoken. */
export const usableInCalls = (r: EngineRun): boolean => r.firstAudioSec <= 2.5 && r.realTimeFactor >= 1;

export function scoreRun(r: EngineRun): Verdict {
  const notes: string[] = [];
  if (!r.licenceOk) notes.push('Licence not confirmed for this use: not a candidate.');
  if (r.glitches > 0) notes.push(`${r.glitches} sentence${r.glitches === 1 ? '' : 's'} with a glitch.`);
  if (!usableInCalls(r)) notes.push('Too slow for a live call (first audio over 2.5 s or slower than real time).');
  const quality = (r.intelligibility * 0.4 + r.naturalness * 0.3 + r.similarity * 0.3) / 5;
  const score = Math.max(0, quality - Math.min(0.5, r.glitches * 0.1));
  return { engine: r.engine, score: Number(score.toFixed(3)), usableInCalls: usableInCalls(r), notes };
}

/**
 * Which engine to recommend. The current voice stays unless a licensed candidate beats it by `margin` on score without more glitches;
 * a slower-than-live candidate may be recommended only for non-live uses (reading aloud, podcasts), never for calls.
 */
export function recommend(current: EngineRun, candidates: EngineRun[], margin = 0.1): { calls: string; offline: string; verdicts: Verdict[] } {
  const base = scoreRun(current);
  const all = [base, ...candidates.map(scoreRun)];
  const better = (c: EngineRun) => { const v = scoreRun(c); return c.licenceOk && v.score >= base.score + margin && c.glitches <= current.glitches; };
  const winner = (pool: EngineRun[]) => pool.filter(better).sort((a, b) => scoreRun(b).score - scoreRun(a).score)[0]?.engine ?? current.engine;
  return { calls: winner(candidates.filter(usableInCalls)), offline: winner(candidates), verdicts: all };
}
