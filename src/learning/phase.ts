/** What the learner is doing right now, in one word the screen can show: learning, reviewing, testing, blocked, paused or idle. Pure. */
export type LearnPhase = 'learning' | 'reviewing' | 'testing' | 'blocked' | 'paused' | 'idle';

export function phaseOf(statusText: string, running: boolean): { phase: LearnPhase; label: string } {
  const t = statusText.trim();
  if (/^(Pausing after a problem|Stopping|Stopped)/i.test(t)) return { phase: 'paused', label: 'Paused' };
  if (!running && /^(Idle|Running|Starting\.\.\.)?$/i.test(t)) return { phase: 'idle', label: 'Idle' };
  if (/^(Waiting for|Loading the model)/i.test(t)) return { phase: 'blocked', label: 'Waiting' };
  if (/^(Judge|Manager)\b/i.test(t)) return { phase: 'reviewing', label: 'Reviewing' };
  if (/^(Exam|Practicing from memory|The Judge is writing)/i.test(t)) return { phase: 'testing', label: 'Testing' };
  return running ? { phase: 'learning', label: 'Learning' } : { phase: 'idle', label: 'Idle' };
}
