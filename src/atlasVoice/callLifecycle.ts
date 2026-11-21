/**
 * The one rule for when a hands-free call opens the microphone: whenever the call is idle (nothing is being recorded, written down,
 * answered or spoken) and the person has not muted or paused it, it listens. Deciding from the current state, instead of from
 * one-off events ("the answer finished"), means a turn that ended oddly (no speech, a failed start, a busy moment when the answer
 * ended) cannot leave the call sitting silent, and a stuck microphone is retried a few times and then reported, not looped forever.
 * Pure.
 */
export interface CallSnapshot {
  handsFree: boolean;
  muted: boolean;
  /** The person's own pause (nobody spoke for a while): stays until they tap. */
  paused: boolean;
  voiceAvailable: boolean;
  disabled: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isGenerating: boolean;
  isModelLoading: boolean;
  speaking: boolean;
  /** Listening starts that did not lead to a recording since the last one that did. */
  failedStarts: number;
}

export type CallPhase = 'ended' | 'muted' | 'paused' | 'unavailable' | 'listening' | 'transcribing' | 'generating' | 'speaking' | 'loading' | 'idle';

/** Quiet time after the call becomes idle before the microphone opens (an answer's speech can begin just after its text ends). */
export const LISTEN_DELAY_MS = 250;
/** How long to wait for a started recording to report that it is running before counting the start as failed. */
export const START_CHECK_MS = 3000;
export const MAX_FAILED_STARTS = 3;

export function callPhase(s: CallSnapshot): CallPhase {
  if (!s.handsFree) return 'ended';
  if (s.speaking) return 'speaking';
  if (s.isRecording) return 'listening';
  if (s.isTranscribing) return 'transcribing';
  if (s.isGenerating) return 'generating';
  if (s.isModelLoading) return 'loading';
  if (s.muted) return 'muted';
  if (s.paused) return 'paused';
  if (!s.voiceAvailable || s.disabled) return 'unavailable';
  return 'idle';
}

/** True when the call should open the microphone now (after LISTEN_DELAY_MS of staying idle). */
export const shouldStartListening = (s: CallSnapshot): boolean => callPhase(s) === 'idle' && s.failedStarts < MAX_FAILED_STARTS;

/** After this many failed starts the call waits, then tries again, instead of staying silent for good. Each wait is longer than the last. */
export const RECOVERY_COOLDOWN_MS = 10_000;
export const MAX_RECOVERY_CYCLES = 3;

export type RecoveryStep = { action: 'none' } | { action: 'retry'; afterMs: number } | { action: 'give-up' };

/**
 * What to do about a microphone that keeps failing to start. The call never sits deaf while looking alive: after MAX_FAILED_STARTS it waits
 * (10 s, then 20 s, then 30 s) and tries again, up to MAX_RECOVERY_CYCLES times, then stops and says so. The person's own choices (muted,
 * paused) and a call that is busy doing something else are never "recovered": there is nothing wrong. Pure.
 */
export function recoveryStep(s: CallSnapshot, cycles: number, cooldownMs: number = RECOVERY_COOLDOWN_MS): RecoveryStep {
  if (!s.handsFree || s.failedStarts < MAX_FAILED_STARTS) return { action: 'none' };
  const phase = callPhase(s);
  if (phase !== 'idle') return { action: 'none' }; // muted, paused, busy, or already listening: not a recorder problem
  return cycles < MAX_RECOVERY_CYCLES ? { action: 'retry', afterMs: cooldownMs * (cycles + 1) } : { action: 'give-up' };
}

/** What the screen says about a microphone that did not start: still trying, or stopped and waiting for the person. */
export const micFailureNote = (cycles: number): string => (cycles < MAX_RECOVERY_CYCLES
  ? 'The microphone did not start. Trying again shortly...'
  : 'The microphone could not start after several tries. Tap the button to try again, or check that no other app is using it.');

/** One line for the call log when the phase changes: what it was, what it is, and how long the last phase lasted. */
export function describePhaseChange(change: { prev: CallPhase; next: CallPhase }, sinceMs: number, extra = ''): string {
  return `[CALL-STATE] ${change.prev} -> ${change.next} after ${(Math.max(0, sinceMs) / 1000).toFixed(1)} s${extra ? ` (${extra})` : ''}`;
}

/** How long a stage may last before the call notes it as a stall (muted and paused are the person's own choices and never stall). */
const STALL_AFTER_MS: Partial<Record<CallPhase, number>> = { idle: 4000, loading: 60000, transcribing: 30000, generating: 300000, speaking: 600000 };

/** Writing down speech that has not finished after this long is not going to: the call gives up on it so the microphone can open again. */
export const TRANSCRIBE_GIVE_UP_MS = 45_000;

/** What the call does about a recognizer that never answered: drop that turn (the person is told to say it again) instead of sitting "writing down" forever. Pure. */
export function stallRecovery(s: CallSnapshot, since: number, limitMs: number = TRANSCRIBE_GIVE_UP_MS): 'cancel-transcription' | null {
  return callPhase(s) === 'transcribing' && since >= limitMs ? 'cancel-transcription' : null;
}

/** One line explaining a stage that has lasted too long, with every flag that decided it, or null while it is normal. Pure. */
export function stallNote(s: CallSnapshot, since: number): string | null {
  const phase = callPhase(s);
  const limit = STALL_AFTER_MS[phase];
  if (limit === undefined || since < limit) return null;
  const on = (Object.keys(s) as (keyof CallSnapshot)[]).filter((k) => s[k] === true || (typeof s[k] === 'number' && s[k] > 0)).join(', ');
  return `[CALL-STALL] ${phase} for ${(since / 1000).toFixed(0)} s (longer than usual); flags on: ${on || 'none'}`;
}

const trace: string[] = [];
const TRACE_MAX = 60;
/** Keeps the newest call-state lines so a failed call can be explained afterwards (shown with the diagnostics). */
export function noteCallTrace(line: string, now = Date.now()): void {
  trace.push(`${new Date(now).toISOString().slice(11, 19)} ${line}`);
  if (trace.length > TRACE_MAX) trace.shift();
}
export const callTrace = (): string[] => [...trace];
export const clearCallTrace = (): void => { trace.length = 0; };
