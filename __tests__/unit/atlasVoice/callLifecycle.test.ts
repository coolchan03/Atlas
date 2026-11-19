import { callPhase, shouldStartListening, MAX_FAILED_STARTS, type CallSnapshot } from '../../../src/atlasVoice/callLifecycle';

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
