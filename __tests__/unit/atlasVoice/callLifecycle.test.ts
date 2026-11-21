import { callPhase, stallNote, shouldStartListening, MAX_FAILED_STARTS, type CallSnapshot } from '../../../src/atlasVoice/callLifecycle';

const idle: CallSnapshot = { handsFree: true, muted: false, paused: false, voiceAvailable: true, disabled: false, isRecording: false, isTranscribing: false, isGenerating: false, isModelLoading: false, speaking: false, failedStarts: 0 };
const with_ = (o: Partial<CallSnapshot>): CallSnapshot => ({ ...idle, ...o });

describe('hands-free call listening rule', () => {
  it('listens whenever the call is idle', () => {
    expect(callPhase(idle)).toBe('idle');
    expect(shouldStartListening(idle)).toBe(true);
  });

  it('walks one turn: listening -> transcribing -> generating -> speaking -> idle (listens again)', () => {
    const turn = [with_({ isRecording: true }), with_({ isTranscribing: true }), with_({ isGenerating: true }), with_({ speaking: true }), idle];
    expect(turn.map(callPhase)).toEqual(['listening', 'transcribing', 'generating', 'speaking', 'idle']);
    expect(turn.map(shouldStartListening)).toEqual([false, false, false, false, true]);
  });

  it('starts when the speech model finishes loading, which a one-time check at call start would miss', () => {
    expect(shouldStartListening(with_({ isModelLoading: true, voiceAvailable: false }))).toBe(false);
    expect(shouldStartListening(with_({ voiceAvailable: true }))).toBe(true);
  });

  it('listens again after an answer that was never spoken (no speech started, nothing to finish)', () => {
    expect(shouldStartListening(with_({ isGenerating: false, speaking: false }))).toBe(true);
  });

  it('does not listen while muted, paused by silence, ended, disabled or without a speech model', () => {
    expect(shouldStartListening(with_({ muted: true }))).toBe(false);
    expect(callPhase(with_({ paused: true }))).toBe('paused');
    expect(shouldStartListening(with_({ paused: true }))).toBe(false);
    expect(shouldStartListening(with_({ handsFree: false }))).toBe(false);
    expect(shouldStartListening(with_({ disabled: true }))).toBe(false);
    expect(callPhase(with_({ voiceAvailable: false }))).toBe('unavailable');
  });

  it('gives up after repeated failed microphone starts instead of looping', () => {
    expect(shouldStartListening(with_({ failedStarts: MAX_FAILED_STARTS - 1 }))).toBe(true);
    expect(shouldStartListening(with_({ failedStarts: MAX_FAILED_STARTS }))).toBe(false);
  });

  it('speaking takes priority, so the microphone is not opened over the answer', () => {
    expect(callPhase(with_({ speaking: true, isRecording: true }))).toBe('speaking');
  });
});

describe('call trace', () => {
  const { describePhaseChange, noteCallTrace, callTrace, clearCallTrace } = require('../../../src/atlasVoice/callLifecycle');
  it('describes a phase change with its duration and keeps the newest lines', () => {
    expect(describePhaseChange({ prev: 'listening', next: 'transcribing' }, 2500, '1 failed mic starts')).toBe('[CALL-STATE] listening -> transcribing after 2.5 s (1 failed mic starts)');
    clearCallTrace();
    for (let i = 0; i < 70; i += 1) noteCallTrace(`line ${i}`, 0);
    expect(callTrace()).toHaveLength(60);
    expect(callTrace()[59]).toContain('line 69');
  });
});

describe('call stall note', () => {
  it('stays silent while a stage is normal and names the flags once an idle call has not started listening', () => {
    expect(stallNote(idle, 1000)).toBeNull();
    expect(stallNote(with_({ muted: true }), 600000)).toBeNull();
    expect(stallNote(with_({ failedStarts: 3 }), 4000)).toContain('flags on: handsFree, voiceAvailable, failedStarts');
  });
});

describe('a microphone that keeps failing is retried, then reported (the call never sits deaf while looking alive)', () => {
  const { recoveryStep, micFailureNote, RECOVERY_COOLDOWN_MS, MAX_RECOVERY_CYCLES } = require('../../../src/atlasVoice/callLifecycle');
  const stuck = with_({ failedStarts: MAX_FAILED_STARTS });

  it('does nothing while the microphone has not failed enough times', () => {
    expect(recoveryStep(with_({ failedStarts: MAX_FAILED_STARTS - 1 }), 0)).toEqual({ action: 'none' });
  });

  it('waits and retries, with a longer wait each time', () => {
    expect(recoveryStep(stuck, 0)).toEqual({ action: 'retry', afterMs: RECOVERY_COOLDOWN_MS });
    expect(recoveryStep(stuck, 1)).toEqual({ action: 'retry', afterMs: RECOVERY_COOLDOWN_MS * 2 });
    expect(recoveryStep(stuck, 2)).toEqual({ action: 'retry', afterMs: RECOVERY_COOLDOWN_MS * 3 });
  });

  it('gives up after the last cycle, so it cannot retry for ever', () => {
    expect(recoveryStep(stuck, MAX_RECOVERY_CYCLES)).toEqual({ action: 'give-up' });
  });

  it('never "recovers" something that is not broken: muted, paused, busy, ended, or already listening', () => {
    for (const o of [{ muted: true }, { paused: true }, { isGenerating: true }, { isTranscribing: true }, { speaking: true }, { isRecording: true }, { isModelLoading: true }, { handsFree: false }, { voiceAvailable: false }]) {
      expect(recoveryStep(with_({ failedStarts: MAX_FAILED_STARTS, ...o }), 0)).toEqual({ action: 'none' });
    }
  });

  it('says "trying again" while it is trying and "tap the button" only once it has stopped', () => {
    expect(micFailureNote(0)).toMatch(/Trying again/);
    expect(micFailureNote(MAX_RECOVERY_CYCLES - 1)).toMatch(/Trying again/);
    expect(micFailureNote(MAX_RECOVERY_CYCLES)).toMatch(/Tap the button/);
  });
});
