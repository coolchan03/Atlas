/**
 * What the briefing player did on its last run, in plain lines: the files it queued (tunes, pauses, lines), the voice each line was
 * made in, what the phone's player skipped and why. Kept in memory (newest 120) so "What just happened" can show it without the log file.
 */
const lines: string[] = [];
const MAX = 120;

export function noteBriefTrace(line: string, now = Date.now()): void {
  lines.push(`${new Date(now).toISOString().slice(11, 19)} ${line}`);
  if (lines.length > MAX) lines.shift();
}
export const briefTrace = (): string[] => [...lines];
export const clearBriefTrace = (): void => { lines.length = 0; };
