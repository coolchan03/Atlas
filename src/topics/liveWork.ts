/**
 * What the AI is doing right now for a lesson, so the screen can say it and so a stuck call can be told from a slow one.
 *  - reading: the model is working through the sources and instructions before its first word (no output yet);
 *  - writing: words are coming (each one resets the stall clock);
 *  - waiting: an answer from a server, which reports no progress, so only the overall limit applies.
 * One lesson is written at a time (generationQueue.ts), so one shared record is enough. The decision of when to give up is `giveUpReason`,
 * a pure function of that record. A call still reading or writing is not stopped just for being slow: it is stopped when it stops
 * making progress, or when it passes the overall limit for the model in use (timeLimit.ts).
 */
type WorkPhase = 'idle' | 'waiting' | 'reading' | 'writing';
export interface Work { phase: WorkPhase; startedAt: number; phaseSince: number; lastTokenAt: number; chars: number }

const idle = (): Work => ({ phase: 'idle', startedAt: 0, phaseSince: 0, lastTokenAt: 0, chars: 0 });
let work: Work = idle();

export const currentWork = (): Work => ({ ...work });
export function beginWork(now = Date.now()): void { work = { phase: 'waiting', startedAt: now, phaseSince: now, lastTokenAt: 0, chars: 0 }; }
export function endWork(): void { work = idle(); }
/** The model started on the prompt (local model only). */
export function noteReading(now = Date.now()): void { if (work.phase === 'waiting') work = { ...work, phase: 'reading', phaseSince: now }; }
/** Output arrived: `content` is what the stream carried (the whole text so far, or just the new piece). */
export function noteWriting(content: string, now = Date.now()): void {
  if (work.phase === 'idle') return;
  const grown = content.length >= work.chars ? content.length : work.chars + content.length; // a growing whole text, or a new piece
  work = { ...work, phase: 'writing', phaseSince: work.phase === 'writing' ? work.phaseSince : now, lastTokenAt: now, chars: grown };
}

export interface GiveUpLimits { readMs: number; stallMs: number; overallMs: number }
export type GiveUp = { why: 'reading' | 'stalled' | 'slow'; message: string };

const mins = (ms: number): string => (ms >= 90_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 1000)} seconds`);

/** Why this call should be stopped now, or null while it is making progress. Pure. */
export function giveUpReason(w: Work, now: number, limits: GiveUpLimits): GiveUp | null {
  if (w.phase === 'idle') return null;
  const total = now - w.startedAt;
  if (w.phase === 'reading' && now - w.phaseSince > limits.readMs) {
    return { why: 'reading', message: `The AI was still reading the sources after ${mins(now - w.phaseSince)} and had not written a word, so it was stopped. The model may be too slow for this much source text: try a smaller model, or fewer or shorter sources.` };
  }
  if (w.phase === 'writing' && now - w.lastTokenAt > limits.stallMs) {
    return { why: 'stalled', message: `The AI stopped writing: no new words for ${mins(now - w.lastTokenAt)} (it had written about ${Math.round(w.chars / 5)} words), so it was stopped. It is stuck, not slow: try again, or use another model.` };
  }
  if (total >= limits.overallMs) {
    const rate = w.phase === 'writing' && now > w.phaseSince ? ` It was writing at about ${(w.chars / 4 / ((now - w.phaseSince) / 1000)).toFixed(1)} tokens a second.` : '';
    return { why: 'slow', message: `The AI was still ${w.phase === 'writing' ? 'writing' : w.phase === 'reading' ? 'reading' : 'working'} after ${mins(total)}, the longest this model is given on this phone, so it was stopped.${rate} A smaller model, or a shorter lesson, will finish.` };
  }
  return null;
}

/** One line for the screen: what the AI is doing and for how long. */
export function workLine(w: Work, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - w.phaseSince) / 1000));
  const time = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
  if (w.phase === 'reading') return `Reading the sources (${time}). Nothing written yet; this is the slow part on some phones.`;
  if (w.phase === 'writing') return `Writing (${time}), about ${Math.round(w.chars / 5)} words so far.`;
  if (w.phase === 'waiting') return `Working (${time})...`;
  return '';
}
