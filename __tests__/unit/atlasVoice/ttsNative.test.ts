/** The phone voice wrapper with a fake native module: speaking, waiting for lines, streaming, files and events. */
type Listener = (e: { utteranceId: string }) => void;

function load(over: Record<string, unknown> = {}, os = 'android') {
  jest.resetModules();
  const listeners: Record<string, Listener> = {};
  const ok = () => Promise.resolve(true);
  const native: Record<string, jest.Mock> = {
    warmUp: jest.fn(ok), setRate: jest.fn(ok), speak: jest.fn(ok), stop: jest.fn(ok), setVoice: jest.fn(ok), setPitch: jest.fn(ok), setEarpiece: jest.fn(() => Promise.resolve()),
    speakIn: jest.fn(ok), listVoices: jest.fn(async () => [{ name: 'v', locale: 'en-US', quality: 400 }]), synthesizeToFile: jest.fn(async (_t: string, p: string) => p), cancelSynthesis: jest.fn(ok),
    speakStreamStart: jest.fn(ok), speakStreamAppend: jest.fn(ok), speakStreamEnd: jest.fn(ok),
    ...(over as Record<string, jest.Mock>),
  };
  class FakeEmitter { addListener(name: string, fn: Listener) { listeners[name] = fn; return { remove() { /* none */ } }; } }
  const rn = require('react-native');
  rn.Platform.OS = os;
  rn.NativeModules.AtlasTts = native;
  Object.defineProperty(rn, 'NativeEventEmitter', { configurable: true, value: FakeEmitter });
  const tts = require('../../../src/atlasVoice/tts');
  const store = require('../../../src/atlasVoice/store').useAtlasVoiceStore;
  return { tts, store, native, listeners };
}
const flush = () => new Promise((r) => setImmediate(r));

describe('availability', () => {
  it('is off without the module or off Android, and every call is then a no-op', async () => {
    const off = load({}, 'ios');
    expect(off.tts.ttsAvailable()).toBe(false);
    off.tts.warmUp(); off.tts.speak('hi'); off.tts.stop(); off.tts.setEarpieceRoute(true); off.tts.speakIn('hola', 'es-ES'); off.tts.cancelSynthesis();
    off.tts.appendSpeechStream('x'); off.tts.endSpeechStream();
    expect(off.tts.beginSpeechStream('m')).toBeNull();
    expect(await off.tts.listVoices()).toEqual([]);
    expect(await off.tts.speakAndWait('hi')).toBe(true);
    await expect(off.tts.synthesizeToFile('t', '/o.wav')).rejects.toThrow('not available');
    await expect(off.tts.synthesizeLineToFile('t', { voice: 'v', path: '/o.wav' })).rejects.toThrow('not available');
    expect(off.tts.canPreRender()).toBe(false);
    expect(off.native.speak).not.toHaveBeenCalled();
  });
});

describe('speaking', () => {
  it('speaks with the saved speed or an override, marks the speaking key, and clears it when the voice fails', async () => {
    const { tts, store, native } = load();
    tts.warmUp();
    expect(native.warmUp).toHaveBeenCalled();
    tts.speak('   ');
    expect(native.speak).not.toHaveBeenCalled();
    tts.speak('Hello', 'm1', 1.5);
    expect(native.setRate).toHaveBeenCalledWith(1.5);
    expect(store.getState().speakingKey).toMatch(/^m1~/);
    native.speak.mockRejectedValueOnce(new Error('engine'));
    tts.speak('Again', 'm2');
    await flush();
    expect(store.getState().speakingKey).toBeNull();
    tts.stop();
    expect(native.stop).toHaveBeenCalled();
  });

  it('speaks another language with a voice, falling back to plain speak on an old build', async () => {
    const { tts, native, store } = load();
    tts.setRateAdjuster((id: string, rate: number) => (id === 'slow' ? rate / 2 : rate));
    tts.speakIn('hola', 'es-ES', { messageId: 'slow', voice: 'es-voice' });
    expect(native.setVoice).toHaveBeenCalledWith('es-voice');
    expect(native.speakIn).toHaveBeenCalledWith('hola', expect.stringMatching(/^slow~/), 'es-ES');
    native.speakIn.mockRejectedValueOnce(new Error('x'));
    tts.speakIn('adios', 'es-ES');
    await flush();
    expect(store.getState().speakingKey).toBeNull();
    tts.setRateAdjuster(null);
    const old = load({ speakIn: undefined, setVoice: undefined });
    old.tts.speakIn('hola', 'es-ES');
    expect(old.native.speak).toHaveBeenCalled();
  });

  it('streams a reply while it is being written, and clears when the voice refuses', async () => {
    const { tts, native, store } = load();
    const stream = tts.beginSpeechStream('reply');
    expect(await stream.started).toBe(true);
    tts.appendSpeechStream('Hello ');
    tts.appendSpeechStream('   ');
    tts.endSpeechStream();
    expect(native.speakStreamAppend).toHaveBeenCalledTimes(1);
    expect(native.speakStreamEnd).toHaveBeenCalled();
    native.speakStreamStart.mockResolvedValueOnce(false);
    const refused = tts.beginSpeechStream('r2');
    expect(await refused.started).toBe(false);
    expect(store.getState().speakingKey).toBeNull();
    native.speakStreamStart.mockRejectedValueOnce(new Error('x'));
    expect(await tts.beginSpeechStream('r3').started).toBe(false);
    expect(load({ speakStreamStart: undefined }).tts.beginSpeechStream('r')).toBeNull();
  });

  it('routes to the earpiece and keeps the screen on for a feature', () => {
    const { tts, native } = load();
    tts.setEarpieceRoute(true);
    expect(native.setEarpiece).toHaveBeenCalledWith(true);
    tts.keepScreenOn(true, 'study');
    tts.keepScreenOn(false, 'study');
    const broken = load({ setEarpiece: jest.fn(() => { throw new Error('old'); }) });
    expect(() => broken.tts.setEarpieceRoute(false)).not.toThrow();
  });
});

describe('waiting for a line to finish', () => {
  it('resolves true when the done event arrives, false when it is stopped, and false when taken over', async () => {
    const { tts, native, listeners } = load();
    const done = tts.speakAndWait('line one', { pitch: 1.2, voice: 'host-a' });
    const key1 = native.speakIn.mock.calls.at(-1)?.[1];
    listeners.AtlasTtsDone({ utteranceId: key1 });
    expect(await done).toBe(true);
    expect(native.setPitch).toHaveBeenCalledWith(1.2);
    const stopped = tts.speakInAndWait('linea', 'es-ES');
    const key2 = native.speakIn.mock.calls.at(-1)?.[1];
    listeners.AtlasTtsStopped({ utteranceId: key2 });
    expect(await stopped).toBe(false);
    const takenOver = tts.speakAndWait('line three');
    tts.speak('interrupt');
    expect(await takenOver).toBe(false);
  });

  it('resolves false when the voice fails to start', async () => {
    const { tts, native } = load();
    native.speakIn.mockRejectedValueOnce(new Error('x'));
    expect(await tts.speakAndWait('line')).toBe(false);
  });
});

describe('events', () => {
  it('marks a chat reply done, reports a missing language, and clears the speaking key on stop', () => {
    const { tts, native, store, listeners } = load();
    const missing = jest.fn();
    tts.onMissingLanguage(missing);
    tts.speak('Hello', 'chat');
    const key = store.getState().speakingKey;
    expect(native.speak).toHaveBeenCalled();
    listeners.AtlasTtsStart({ utteranceId: key });
    listeners.AtlasTtsNoLanguage({ utteranceId: 'es-ES' });
    expect(missing).toHaveBeenCalledWith('es-ES');
    listeners.AtlasTtsDone({ utteranceId: key });
    expect(store.getState().speakingKey).toBeNull();
    tts.speak('Again', 'chat');
    listeners.AtlasTtsStopped({ utteranceId: store.getState().speakingKey });
    expect(store.getState().speakingKey).toBeNull();
    listeners.AtlasTtsStart(undefined as never);
    tts.onMissingLanguage(null);
    listeners.AtlasTtsNoLanguage({ utteranceId: 'x' });
  });
});

describe('voices and files', () => {
  it('lists voices, retrying once when the engine is still starting', async () => {
    jest.useFakeTimers();
    const { tts, native } = load();
    native.listVoices.mockResolvedValueOnce([]).mockResolvedValueOnce([{ name: 'late', locale: 'en', quality: 1 }]);
    const pending = tts.listVoices('en');
    await jest.advanceTimersByTimeAsync(1300);
    expect(await pending).toEqual([{ name: 'late', locale: 'en', quality: 1 }]);
    native.listVoices.mockRejectedValueOnce(new Error('x'));
    expect(await tts.listVoices()).toEqual([]);
    expect(await load({ listVoices: undefined }).tts.listVoices()).toEqual([]);
    jest.useRealTimers();
  });

  it('saves speech to a file, setting and restoring the voice and pitch', async () => {
    const { tts, native } = load();
    expect(tts.canPreRender()).toBe(true);
    expect(await tts.synthesizeToFile('hi', '/a.wav', 'en-GB')).toBe('/a.wav');
    expect(await tts.synthesizeLineToFile('hi', { voice: 'host', path: '/b.wav', pitch: 1.3 })).toBe('/b.wav');
    expect(native.setVoice).toHaveBeenLastCalledWith('');
    expect(native.setPitch).toHaveBeenLastCalledWith(1);
    native.synthesizeToFile.mockRejectedValueOnce(new Error('cancelled'));
    await expect(tts.synthesizeLineToFile('hi', { voice: 'host', path: '/c.wav' })).rejects.toThrow('cancelled');
    tts.cancelSynthesis();
    expect(native.cancelSynthesis).toHaveBeenCalled();
  });
});

export {};
