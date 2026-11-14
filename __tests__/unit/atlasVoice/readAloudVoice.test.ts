/**
 * Read aloud with a cloned voice, against a fake voice engine that follows the real engine's contract: choosing a voice takes
 * time, speech ends with exactly one of done, error or stopped, and the engine reports when sound starts and when it runs dry.
 * Covers cold starts, repeated playback, stopping while loading, switching between clones of one model, failures and long reading.
 */
type Listener = (e: { utteranceId: string; message?: string }) => void;

function load() {
  jest.resetModules();
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  const listeners: Record<string, Listener> = {};
  const gates: Array<() => void> = [];
  const activations: string[] = [];
  const spoken: Array<{ text: string; key: string; reference: string }> = [];
  const engine = { reference: '', slow: true, failSpeech: '' };
  const ok = () => Promise.resolve(true);
  const native: Record<string, jest.Mock> = {
    warmUp: jest.fn(ok), setRate: jest.fn(ok), setPitch: jest.fn(ok), setVoice: jest.fn(ok), speak: jest.fn(ok), setEarpiece: jest.fn(ok),
    stop: jest.fn(async () => true),
    setNeuralVoice: jest.fn(async () => 4),
    installedNeuralVoices: jest.fn(async () => [{ id: 'pocket-tts-int8', bytes: 1 }]),
    activateClonedVoice: jest.fn(async (_id: string, _sid: number, _style: unknown, ref: string) => {
      activations.push(ref);
      if (engine.slow) await new Promise<void>((resolve) => { gates.push(resolve); });
      engine.reference = ref;
      return 2;
    }),
    speakIn: jest.fn(async (text: string, key: string) => {
      spoken.push({ text, key, reference: engine.reference });
      return true;
    }),
  };
  class FakeEmitter { addListener(name: string, fn: Listener) { listeners[name] = fn; return { remove() { /* none */ } }; } }
  const rn = require('react-native');
  rn.Platform.OS = 'android';
  rn.NativeModules.AtlasTts = native;
  Object.defineProperty(rn, 'NativeEventEmitter', { configurable: true, value: FakeEmitter });
  const ra = require('../../../src/atlasVoice/readAloud');
  const profiles = require('../../../src/atlasVoice/profiles').useVoiceProfiles;
  const voice = require('../../../src/atlasVoice/store').useAtlasVoiceStore;
  const jake = profiles.getState().addProfile({ name: 'Jake', voiceId: 'pocket-tts-int8', sid: 0, rate: 1, referenceId: 'ref-jake' });
  const daddy = profiles.getState().addProfile({ name: 'British Daddy', voiceId: 'pocket-tts-int8', sid: 0, rate: 1, referenceId: 'ref-daddy' });
  voice.getState().setReadVoiceId(jake.id);
  const emit = (name: string, key: string, message?: string) => listeners[name]?.({ utteranceId: key, message });
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
  /** Lets the engine finish choosing a voice. */
  const finishLoading = async () => { while (gates.length) gates.shift()!(); await settle(); };
  const lastKey = () => spoken[spoken.length - 1].key;
  const state = () => ra.readAloud.useReader.getState();
  const read = (text: string) => { ra.readAloud.load(text, 't'); ra.readAloud.play(); };
  // listeners are registered when speech is first used
  return { ra, native, engine, spoken, activations, jake, daddy, voice, emit, settle, finishLoading, lastKey, state, read, profiles };
}

afterEach(() => { jest.useRealTimers(); });

describe('a cold start', () => {
  it('says loading until the voice and recording are active, then generating, speaking, and finished', async () => {
    const t = load();
    t.read('Hey man how is it going.');
    await t.settle();
    expect(t.state()).toMatchObject({ status: 'reading', phase: 'loading', preparing: true });
    expect(t.spoken).toHaveLength(0); // nothing is handed to the engine before the voice and its recording are active
    await t.finishLoading();
    expect(t.state()).toMatchObject({ phase: 'generating', preparing: true });
    expect(t.spoken).toHaveLength(1);
    expect(t.spoken[0].reference).toBe('ref-jake'); // the chosen recording was active when generation began
    t.emit('AtlasTtsStart', t.lastKey());
    expect(t.state()).toMatchObject({ phase: 'speaking', preparing: false });
    t.emit('AtlasTtsBuffering', t.lastKey());
    expect(t.state().phase).toBe('buffering');
    t.emit('AtlasTtsResumed', t.lastKey());
    expect(t.state().phase).toBe('speaking');
    t.emit('AtlasTtsDone', t.lastKey());
    await t.settle();
    expect(t.state()).toMatchObject({ status: 'idle', phase: 'idle', index: 0 });
  });
});

describe('repeated playback', () => {
  it('does not load the voice again for the same clone, and keeps the borrowed voice for a quick second play', async () => {
    const t = load();
    t.engine.slow = false;
    t.read('First reading.');
    await t.settle();
    t.emit('AtlasTtsStart', t.lastKey()); t.emit('AtlasTtsDone', t.lastKey());
    await t.settle();
    t.read('Second reading.');
    await t.settle();
    t.emit('AtlasTtsStart', t.lastKey()); t.emit('AtlasTtsDone', t.lastKey());
    await t.settle();
    expect(t.activations).toEqual(['ref-jake']); // one load, not one per reading
    t.ra.readAloud.stop();
    expect(t.native.setNeuralVoice).not.toHaveBeenCalled(); // the saved voice is not put back the moment reading ends
    jest.advanceTimersByTime(20000); // nobody asked for another voice, so it is put back after a quiet time
    await t.settle();
    expect(t.native.setNeuralVoice).toHaveBeenCalledTimes(1);
  });
});

describe('stopping while loading', () => {
  it('never starts speaking after the person pressed stop', async () => {
    const t = load();
    t.read('Hey man how is it going.');
    await t.settle();
    t.ra.readAloud.stop();
    await t.finishLoading();
    expect(t.spoken).toHaveLength(0);
    expect(t.state()).toMatchObject({ status: 'idle', phase: 'idle' });
  });

  it('plays the new reading when play is pressed again while the old one is still loading', async () => {
    const t = load();
    t.read('First.');
    await t.settle();
    t.ra.readAloud.stop();
    t.read('Second.');
    await t.finishLoading();
    await t.finishLoading();
    expect(t.spoken.map((s) => s.text)).toEqual(['Second.']);
    expect(t.state().status).toBe('reading');
  });
});

describe('changing voices', () => {
  it('switches between two clones of one model in order, with the right recording each time', async () => {
    const t = load();
    t.engine.slow = false;
    t.read('In Jake voice.');
    await t.settle();
    t.emit('AtlasTtsStart', t.lastKey()); t.emit('AtlasTtsDone', t.lastKey());
    await t.settle();
    t.voice.getState().setReadVoiceId(t.daddy.id);
    t.read('In the other voice.');
    await t.settle();
    expect(t.spoken.map((s) => s.reference)).toEqual(['ref-jake', 'ref-daddy']);
    expect(t.activations).toEqual(['ref-jake', 'ref-daddy']);
  });

  it('changing voice while a reading is loading uses only the newest voice', async () => {
    const t = load();
    t.read('Hello there.');
    await t.settle();
    t.ra.readAloud.stop();
    t.voice.getState().setReadVoiceId(t.daddy.id);
    t.read('Hello again.');
    await t.finishLoading();
    await t.finishLoading();
    expect(t.spoken).toHaveLength(1);
    expect(t.spoken[0].reference).toBe('ref-daddy');
  });
});

describe('failures', () => {
  it('shows why reading stopped when the engine reports an error, and keeps the place', async () => {
    const t = load();
    t.engine.slow = false;
    t.read('Hey man how is it going.');
    await t.settle();
    t.emit('AtlasTtsError', t.lastKey(), 'The voice produced no audio');
    await t.settle();
    expect(t.state()).toMatchObject({ status: 'paused', phase: 'failed', failure: 'The voice produced no audio', index: 0 });
  });

  it('shows why when the voice cannot be loaded, instead of reading in another voice', async () => {
    const t = load();
    t.native.activateClonedVoice.mockRejectedValueOnce(new Error('The reference recording was deleted'));
    t.read('Hey man how is it going.');
    await t.settle();
    expect(t.spoken).toHaveLength(0);
    expect(t.state().phase).toBe('failed');
    expect(t.state().failure).toContain('The reference recording was deleted');
  });

  it('is not marked failed when another voice interrupts it', async () => {
    const t = load();
    t.engine.slow = false;
    t.read('Hey man how is it going.');
    await t.settle();
    t.emit('AtlasTtsStopped', t.lastKey(), 'interrupted');
    await t.settle();
    expect(t.state()).toMatchObject({ status: 'paused', phase: 'paused', failure: '' });
  });
});

describe('long reading', () => {
  it('reads every piece in order, each in the chosen voice', async () => {
    const t = load();
    t.engine.slow = false;
    const text = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i + 1} of a long document that goes on for a while.`).join('\n\n');
    t.ra.readAloud.load(text, 'long');
    const parts = t.state().parts.length;
    expect(parts).toBeGreaterThanOrEqual(2);
    t.ra.readAloud.play();
    for (let i = 0; i < parts; i++) {
      await t.settle();
      expect(t.spoken).toHaveLength(i + 1);
      t.emit('AtlasTtsStart', t.lastKey()); t.emit('AtlasTtsDone', t.lastKey());
    }
    await t.settle();
    expect(t.spoken.every((s) => s.reference === 'ref-jake')).toBe(true);
    expect(t.state()).toMatchObject({ status: 'idle', phase: 'idle' });
    expect(t.spoken.map((s) => s.text).join(' ')).toContain('sentence number 30');
  });
});

export {};
