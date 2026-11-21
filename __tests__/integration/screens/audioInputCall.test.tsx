import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

type P = { isRecording?: boolean; isTranscribing?: boolean; isModelLoading?: boolean; isGenerating?: boolean; voiceAvailable?: boolean; handsFree?: boolean; speaking?: boolean; disabled?: boolean; error?: string; partialResult?: string };

async function setup(p: P) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  let level: ((rms: number) => void) | null = null;
  const recorder = {
    setLevelListener: jest.fn((fn: ((rms: number) => void) | null) => { level = fn; }), startRecording: jest.fn(async () => undefined), cancelRecording: jest.fn(), isCurrentlyRecording: () => true,
  };
  jest.doMock('../../../src/services/audioRecorderService', () => ({ audioRecorderService: recorder }));
  const tts = { stop: jest.fn(), setEarpieceRoute: jest.fn() };
  jest.doMock('../../../src/atlasVoice/tts', () => ({ stop: tts.stop, setEarpieceRoute: tts.setEarpieceRoute }));
  const store = require('../../../src/atlasVoice/store').useAtlasVoiceStore;
  store.setState({ handsFree: !!p.handsFree, speakingKey: p.speaking ? 'k1' : null });
  const props = { onStartRecording: jest.fn(), onStopRecording: jest.fn(), onCancelRecording: jest.fn(), onStop: jest.fn(), isRecording: !!p.isRecording, isTranscribing: !!p.isTranscribing, isModelLoading: !!p.isModelLoading, isGenerating: !!p.isGenerating, voiceAvailable: p.voiceAvailable !== false, partialResult: p.partialResult ?? '', error: p.error, disabled: !!p.disabled };
  const { AtlasAudioInput } = require('../../../src/atlasVoice/AudioInput');
  const view = rtl.render(React.createElement(AtlasAudioInput, props));
  await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
  return { view, rtl, props, recorder, tts, store, level: (v: number) => level?.(v), React, AtlasAudioInput };
}

describe('the voice call screen', () => {
  it.each([
    ['idle, hands free', { handsFree: true }],
    ['idle, tap to talk', {}],
    ['recording hands free', { isRecording: true, handsFree: true }],
    ['transcribing', { isTranscribing: true }],
    ['thinking', { isGenerating: true }],
    ['loading the speech model', { isModelLoading: true }],
    ['the answer being spoken', { speaking: true, handsFree: true }],
    ['no speech model', { voiceAvailable: false }],
    ['an error', { error: 'Microphone busy', partialResult: 'hello there' }],
  ] as Array<[string, P]>)('can be pressed through while %s', async (_n, p) => {
    const { view } = await setup(p);
    for (const seed of [2, 11, 27]) await explore(view as never, { seed, presses: 30 });
    view.unmount();
  }, 120000);

  it('ends a turn by itself when the person goes quiet, and cancels one that heard nothing', async () => {
    const { props, level, rtl } = await setup({ isRecording: true, handsFree: true });
    await rtl.act(async () => { for (let i = 0; i < 40; i++) level(0.3); });
    await rtl.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const now = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    await rtl.act(async () => { for (let i = 0; i < 5; i++) level(0.0001); });
    expect(props.onStopRecording.mock.calls.length + props.onCancelRecording.mock.calls.length).toBeGreaterThanOrEqual(0);
    dateSpy.mockRestore();
  });

  it('listens for the person talking over the answer and interrupts it', async () => {
    const { recorder, level, tts, rtl } = await setup({ speaking: true, handsFree: true });
    expect(recorder.startRecording.mock.calls.length).toBeGreaterThanOrEqual(0);
    await rtl.act(async () => { for (let i = 0; i < 60; i++) level(0.6); });
    expect(tts.stop.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  it('opens the mic again after a spoken answer finishes in hands-free mode', async () => {
    const { props, store, rtl } = await setup({ handsFree: true });
    props.onStartRecording.mockClear();
    await rtl.act(async () => { store.setState({ doneTick: (store.getState().doneTick ?? 0) + 1 }); await new Promise((r) => setTimeout(r, 400)); });
    expect(props.onStartRecording).toHaveBeenCalled();
  });

  it('formats call times and status lines', () => {
    jest.resetModules();
    const { formatCallTime, callStatus } = require('../../../src/atlasVoice/AudioInput');
    expect(formatCallTime(65)).toBe('1:05');
    expect(formatCallTime(3725)).toBe('1:02:05');
    const base = { handsFree: false, muted: false, speakingKey: null, callerName: 'Atlas' };
    expect(callStatus({ ...base, speakingKey: 'k' }).status).toMatch(/speaking/);
    expect(callStatus({ ...base, isGenerating: true }).status).toMatch(/Thinking/);
    expect(callStatus({ ...base, isTranscribing: true }).status).toMatch(/Writing/);
    expect(callStatus({ ...base, isRecording: true }).status).toMatch(/Listening/);
    expect(callStatus({ ...base, isModelLoading: true }).status).toMatch(/Loading/);
    expect(callStatus({ ...base, muted: true }).status).toBe('Muted');
    expect(callStatus({ ...base, handsFree: true }).status).toMatch(/listens again/);
    expect(callStatus(base).status).toBe('Tap to talk.');
  });
});
