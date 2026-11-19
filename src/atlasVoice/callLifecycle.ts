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
