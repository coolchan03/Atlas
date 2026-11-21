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
export interface Work { phase: WorkPhase; startedAt: number; phaseSince: number; lastTokenAt: number; chars: number; text: string; /** How much text the model is given to read before it can write (instructions and sources), in characters. */ promptChars?: number }

const idle = (): Work => ({ phase: 'idle', startedAt: 0, phaseSince: 0, lastTokenAt: 0, chars: 0, text: '' });
let work: Work = idle();
/** Which call owns the record: a call that was stopped and finishes late must not touch the record of the call that came after it. */
let owner = 0;

export const currentWork = (): Work => ({ ...work });
/** Starts a call's record and returns its token; the other functions only act for the call whose token is the latest. */
export function beginWork(now = Date.now(), promptChars = 0): number { owner += 1; work = { phase: 'waiting', startedAt: now, phaseSince: now, lastTokenAt: 0, chars: 0, text: '', ...(promptChars > 0 ? { promptChars } : {}) }; return owner; }
export function endWork(token: number): void { if (token === owner) work = idle(); }
/** The model started on the prompt (local model only). */
export function noteReading(token: number, now = Date.now()): void { if (token === owner && work.phase === 'waiting') work = { ...work, phase: 'reading', phaseSince: now }; }
/** Output arrived: `content` is what the stream carried (the whole text so far, or just the new piece). */
export function noteWriting(token: number, content: string, now = Date.now()): void {
  if (token !== owner || work.phase === 'idle') return;
  // The stream sends either the whole text so far (it starts with what came before) or just the new piece.
  const whole = work.text !== '' && content.length > work.text.length && content.startsWith(work.text);
  work = { ...work, phase: 'writing', phaseSince: work.phase === 'writing' ? work.phaseSince : now, lastTokenAt: now, chars: whole ? content.length : work.chars + content.length, text: whole ? content : content.length > 2000 ? '' : content };
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
  // Reading and writing are different work with different speeds, so each line says its own measure: how much there is to read (and for how
  // long it has been read), or how much has been written and how fast. A slow read is not a slow writer.
  if (w.phase === 'reading') {
    const toRead = w.promptChars ? `about ${Math.round(w.promptChars / 5)} words of instructions and sources` : 'the instructions and sources';
    return `Reading ${toRead} (${time} so far). Nothing written yet; this is the slow part on some phones.`;
  }
  if (w.phase === 'writing') {
    const words = Math.round(w.chars / 5);
    const speed = secs >= 5 && words >= 5 ? `, about ${(words / secs).toFixed(1)} words a second` : '';
    return `Writing (${time}): about ${words} words so far${speed}.`;
  }
  if (w.phase === 'waiting') return `Working (${time})...`;
  return '';
}
