/** Push-to-talk dictation: the model gets ready first, partial text streams in, and every way out leaves a clean state. */
type Result = { text: string; isCapturing: boolean; recordingTime: number };

const mockState = { loaded: true, transcribing: false, startFails: '', stopFails: false };
let mockCallback: ((r: Result) => void) | undefined;
const mockWhisper = {
  isModelLoaded: jest.fn(() => mockState.loaded), isCurrentlyTranscribing: jest.fn(() => mockState.transcribing),
  startRealtimeTranscription: jest.fn(async (cb: (r: Result) => void) => { if (mockState.startFails) throw new Error(mockState.startFails); mockCallback = cb; }),
  stopTranscription: jest.fn(async () => { if (mockState.stopFails) throw new Error('stop failed'); }), forceReset: jest.fn(),
};
jest.mock('../../../src/services/whisperService', () => ({ ...jest.requireActual('../../../src/services/whisperService'), whisperService: new Proxy({}, { get: (_t, k) => (mockWhisper as unknown as Record<string | symbol, unknown>)[k] }) }));

import * as rtl from '@testing-library/react-native';
import { Vibration } from 'react-native';
import { useWhisperTranscription } from '../../../src/hooks/useWhisperTranscription';

function load(opts: { loaded?: boolean; transcribing?: boolean; startFails?: string; stopFails?: boolean } = {}) {
  Object.assign(mockState, { loaded: opts.loaded ?? true, transcribing: opts.transcribing ?? false, startFails: opts.startFails ?? '', stopFails: opts.stopFails ?? false });
  Object.values(mockWhisper).forEach((f) => f.mockClear());
  mockWhisper.isModelLoaded.mockImplementation(() => mockState.loaded);
  mockWhisper.isCurrentlyTranscribing.mockImplementation(() => mockState.transcribing);
  mockWhisper.startRealtimeTranscription.mockImplementation(async (cb: (r: Result) => void) => { if (mockState.startFails) throw new Error(mockState.startFails); mockCallback = cb; });
  mockWhisper.stopTranscription.mockImplementation(async () => { if (mockState.stopFails) throw new Error('stop failed'); });
  mockWhisper.forceReset.mockImplementation(() => undefined);
  vibrate.mockImplementation(() => undefined);
  mockCallback = undefined;
  const ensure = jest.fn(async () => true);
  const hook = rtl.renderHook(() => useWhisperTranscription({ ensureModelReady: ensure }));
  return { hook, whisper: mockWhisper, state: mockState, ensure, vibrate, emit: (r: Result) => rtl.act(() => mockCallback?.(r)) };
}
const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('starting', () => {
  it('records, streams a cleaned partial, and shows the final text after the minimum time', async () => {
    const { hook, emit } = load();
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    expect(hook.result.current.isRecording).toBe(true);
    expect(hook.result.current.isTranscribing).toBe(true);
    emit({ text: '[BLANK_AUDIO] hello', isCapturing: true, recordingTime: 1 });
    expect(hook.result.current.partialResult).toBe('hello');
    expect(hook.result.current.recordingTime).toBe(1);
    emit({ text: '[BLANK_AUDIO]', isCapturing: true, recordingTime: 2 });
    expect(hook.result.current.partialResult).toBe('hello');
    emit({ text: 'hello world', isCapturing: false, recordingTime: 3 });
    expect(hook.result.current.isRecording).toBe(false);
    await rtl.act(async () => { jest.advanceTimersByTime(700); });
    expect(hook.result.current.finalResult).toBe('hello world');
    rtl.act(() => hook.result.current.clearResult());
    expect(hook.result.current.finalResult).toBe('');
    expect(hook.result.current.isTranscribing).toBe(false);
  });

  it('shows the final text at once when the minimum time already passed', async () => {
    const { hook, emit } = load();
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    rtl.act(() => { hook.result.current.stopRecording(); });
    await rtl.act(async () => { jest.advanceTimersByTime(3000); });
    emit({ text: 'late words', isCapturing: false, recordingTime: 5 });
    expect(hook.result.current.finalResult).toBe('late words');
  });

  it('clears the transcribing state when only silence was heard or nothing came back', async () => {
    const { hook, emit } = load();
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    emit({ text: '[BLANK_AUDIO]', isCapturing: false, recordingTime: 1 });
    expect(hook.result.current.isTranscribing).toBe(false);
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    emit({ text: '', isCapturing: false, recordingTime: 1 });
    expect(hook.result.current.isTranscribing).toBe(false);
  });

  it('ignores a second press while recording', async () => {
    const { hook, whisper } = load();
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    expect(whisper.startRealtimeTranscription).toHaveBeenCalledTimes(1);
    const busy = load({ transcribing: true });
    await rtl.act(async () => { await busy.hook.result.current.startRecording(); });
    expect(busy.whisper.startRealtimeTranscription).not.toHaveBeenCalled();
  });

  it('gets the model ready first, and says so when it cannot', async () => {
    const ready = load({ loaded: false });
    await rtl.act(async () => { await ready.hook.result.current.startRecording(); });
    expect(ready.ensure).toHaveBeenCalled();
    expect(ready.whisper.startRealtimeTranscription).toHaveBeenCalled();
    const refused = load({ loaded: false });
    refused.ensure.mockResolvedValueOnce(false);
    await rtl.act(async () => { await refused.hook.result.current.startRecording(); });
    expect(refused.hook.result.current.error).toMatch(/Couldn't load the voice model/);
    const thrown = load({ loaded: false });
    thrown.ensure.mockRejectedValueOnce(new Error('oom'));
    await rtl.act(async () => { await thrown.hook.result.current.startRecording(); });
    expect(thrown.hook.result.current.error).toMatch(/Couldn't load/);
  });

  it('does not start a recording that was stopped while the model was loading', async () => {
    const { hook, whisper, ensure } = load({ loaded: false });
    const gate = { release: (_v: boolean) => undefined as void };
    ensure.mockImplementationOnce(() => new Promise<boolean>((r) => { gate.release = r; }));
    let start!: Promise<void>;
    rtl.act(() => { start = hook.result.current.startRecording(); });
    rtl.act(() => { hook.result.current.clearResult(); });
    await rtl.act(async () => { gate.release(true); await start; });
    expect(whisper.startRealtimeTranscription).not.toHaveBeenCalled();
  });

  it('reports an error from the engine and resets it', async () => {
    const { hook, whisper } = load({ startFails: 'mic busy' });
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    expect(hook.result.current.error).toBe('mic busy');
    expect(hook.result.current.isRecording).toBe(false);
    expect(whisper.forceReset).toHaveBeenCalled();
  });
});

describe('stopping and leaving', () => {
  it('keeps recording a moment for trailing audio, then stops with a tap of haptics', async () => {
    const { hook, whisper } = load();
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    await rtl.act(async () => { const stop = hook.result.current.stopRecording(); jest.advanceTimersByTime(2600); await stop; });
    expect(whisper.stopTranscription).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(30);
  });

  it('resets when stopping fails, and when cancelled during the trailing capture', async () => {
    const failing = load({ stopFails: true });
    await rtl.act(async () => { await failing.hook.result.current.startRecording(); });
    await rtl.act(async () => { const stop = failing.hook.result.current.stopRecording(); jest.advanceTimersByTime(2600); await stop; });
    expect(failing.whisper.forceReset).toHaveBeenCalled();
    expect(failing.hook.result.current.isTranscribing).toBe(false);
    const cancelled = load();
    await rtl.act(async () => { await cancelled.hook.result.current.startRecording(); });
    await rtl.act(async () => {
      const stop = cancelled.hook.result.current.stopRecording();
      cancelled.hook.result.current.clearResult();
      jest.advanceTimersByTime(2600);
      await stop;
    });
    expect(cancelled.whisper.forceReset).toHaveBeenCalled();
  });

  it('stops the microphone when the screen goes away mid-session, and when a result is cleared mid-session', async () => {
    const { hook, whisper, state } = load();
    state.transcribing = true;
    rtl.act(() => hook.result.current.clearResult());
    expect(whisper.stopTranscription).toHaveBeenCalled();
    hook.unmount();
    expect(whisper.forceReset).toHaveBeenCalled();
  });

  it('ignores results that arrive after cancelling', async () => {
    const { hook, emit } = load();
    await rtl.act(async () => { await hook.result.current.startRecording(); });
    rtl.act(() => hook.result.current.clearResult());
    emit({ text: 'too late', isCapturing: true, recordingTime: 1 });
    expect(hook.result.current.partialResult).toBe('');
  });
});

export {};
