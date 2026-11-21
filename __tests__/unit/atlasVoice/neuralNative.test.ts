/** Natural offline voices with a fake native engine: installing, importing, choosing, restoring and host voices. */
type Listener = (e: { id: string; progress: number }) => void;

function load(over: Record<string, unknown> | null = {}) {
  jest.resetModules();
  const rn = require('react-native');
  const ok = () => Promise.resolve(1);
  const native = over === null ? undefined : {
    setNeuralVoice: jest.fn(async () => 4), installedNeuralVoices: jest.fn(async () => [{ id: 'piper-amy', bytes: 10 }, { id: 'vits-piper-en_GB-northern_english_male-medium', bytes: 20 }]),
    downloadNeuralVoice: jest.fn(ok), downloadAndImportNeuralVoice: jest.fn(async () => 'imported-id'), importNeuralVoice: jest.fn(async () => 'imported-id'),
    deleteNeuralVoice: jest.fn(ok), cancelNeuralDownload: jest.fn(ok), activateClonedVoice: jest.fn(async () => 3), ...over,
  };
  rn.NativeModules.AtlasTts = native;
  let listener: Listener | undefined;
  class FakeEmitter { addListener(_n: string, fn: Listener) { listener = fn; return { remove() { /* none */ } }; } }
  Object.defineProperty(rn, 'NativeEventEmitter', { configurable: true, value: FakeEmitter });
  const neural = require('../../../src/atlasVoice/neural');
  const store = require('../../../src/atlasVoice/store').useAtlasVoiceStore;
  return { neural, store, native: native as Record<string, jest.Mock>, emit: (e: { id: string; progress: number }) => listener?.(e) };
}

describe('names and packages', () => {
  it('names imported voices, recognises voice archives and builds an id from a file name', () => {
    const { neural } = load();
    expect(neural.importedVoiceName('vits-piper-en_GB-northern_english_male-medium')).toBe('Northern English Male (Piper, en GB)');
    expect(neural.importedVoiceName('vits-piper-en_US-amy')).toBe('Amy (Piper, en US)');
    expect(neural.importedVoiceName('pocket-tts-clone')).toBe('Pocket TTS (voice cloning)');
    expect(neural.importedVoiceName('sherpa-onnx-some_voice')).toBe('Some Voice');
    expect(neural.isVoiceArchive('Voice.TAR.BZ2')).toBe(true);
    expect(neural.isVoiceArchive('kokoro-en.zip')).toBe(true);
    expect(neural.isVoiceArchive('holiday.zip')).toBe(false);
    expect(neural.voiceIdForName('/dl/vits-piper-en_US-amy.tar.bz2')).toBe('vits-piper-en_US-amy');
    expect(neural.voiceIdForName('...')).toBe('imported-voice');
    expect(neural.voiceIdForName('my voice (1).zip')).toBe('my_voice__1');
  });

  it('lists Atlas voices followed by installed imported ones, and finds a voice by id', () => {
    const { neural } = load();
    const catalog = neural.voiceCatalog({ 'piper-amy': 1, 'vits-piper-en_GB-x-medium': 2, 'pocket-tts-mine': 3 });
    expect(catalog.length).toBe(neural.NEURAL_VOICES.length + 2);
    expect(catalog.find((v: any) => v.id === 'pocket-tts-mine').desc).toMatch(/Clones/);
    expect(neural.findNeuralVoice('kokoro-en')?.speakers?.length).toBe(11);
    expect(neural.findNeuralVoice('nope')).toBeUndefined();
  });

  it('maps a catalogue speaker to what the engine needs, including accents and depth variants', () => {
    const { neural } = load();
    expect(neural.nativeVoice('kokoro-v1-en', 1027)).toEqual({ sid: 27, style: { accent: 'gb', depth: 0.9 } });
    expect(neural.nativeVoice('kokoro-v1-en', 12)).toEqual({ sid: 12, style: { accent: 'us', depth: 1 } });
    expect(neural.nativeVoice('piper-amy', 0)).toEqual({ sid: 0, style: { accent: '', depth: 1 } });
  });
});

describe('installing', () => {
  it('reports availability and reads what is installed', async () => {
    expect(load(null).neural.neuralAvailable()).toBe(false);
    await load(null).neural.refreshInstalled();
    const { neural, native } = load();
    expect(neural.neuralAvailable()).toBe(true);
    await neural.refreshInstalled();
    expect(neural.useNeuralVoices.getState().installed).toEqual({ 'piper-amy': 10, 'vits-piper-en_GB-northern_english_male-medium': 20 });
    expect(native.installedNeuralVoices).toHaveBeenCalled();
  });

  it('downloads with progress and clears the progress when it ends or fails', async () => {
    const { neural, native, emit } = load();
    const run = neural.downloadVoice('piper-amy');
    emit({ id: 'piper-amy', progress: 0.5 });
    expect(neural.useNeuralVoices.getState().progress['piper-amy']).toBe(0.5);
    await run;
    expect(neural.useNeuralVoices.getState().progress['piper-amy']).toBeUndefined();
    native.downloadNeuralVoice.mockRejectedValueOnce(new Error('offline'));
    await expect(neural.downloadVoice('piper-amy')).rejects.toThrow('offline');
    expect(neural.useNeuralVoices.getState().progress['piper-amy']).toBeUndefined();
    neural.cancelVoiceDownload('piper-amy');
    expect(native.cancelNeuralDownload).toHaveBeenCalledWith('piper-amy');
  });

  it('downloads a package from a web address, imports a file, and installs one already on the phone', async () => {
    const { neural, native } = load();
    expect(await neural.downloadVoicePackage('https://x/voice.zip', 'vits-voice.zip')).toBe('imported-id');
    native.downloadAndImportNeuralVoice.mockRejectedValueOnce(new Error('bad zip'));
    await expect(neural.downloadVoicePackage('https://x/v.zip', 'v.zip')).rejects.toThrow('bad zip');
    expect(await neural.importVoiceAt('file:///v.tar.bz2', '')).toBe('imported-id');
    expect(native.importNeuralVoice).toHaveBeenCalledWith('file:///v.tar.bz2', 'imported-voice');
    jest.doMock('@react-native-documents/picker', () => ({ pick: jest.fn(async () => [{ uri: 'file:///a.zip', name: 'a.zip' }]) }));
    expect(await neural.importVoiceFile()).toBe('imported-id');
    const empty = load();
    jest.doMock('@react-native-documents/picker', () => ({ pick: jest.fn(async () => []) }));
    expect(await empty.neural.importVoiceFile()).toBeNull();
  });
});

describe('choosing a voice', () => {
  it('selects a voice, remembers how many speakers it has, and switches off with an empty id', async () => {
    const { neural, native, store } = load();
    expect(await neural.selectVoice('kokoro-en', 3)).toBe(4);
    expect(native.setNeuralVoice).toHaveBeenCalledWith('kokoro-en', 3, expect.any(Object));
    expect(store.getState()).toMatchObject({ neuralVoice: 'kokoro-en', neuralSid: 3 });
    expect(neural.useNeuralVoices.getState().speakerCount['kokoro-en']).toBe(4);
    await neural.selectVoice('kokoro-en');
    expect(native.setNeuralVoice).toHaveBeenLastCalledWith('kokoro-en', 3, expect.any(Object));
    await neural.selectVoice('');
    expect(store.getState().neuralVoice).toBe('');
    expect(await load(null).neural.selectVoice('kokoro-en')).toBe(0);
  });

  it('needs a recorded sample for a cloned voice, an updated app, and a settled choice', async () => {
    const { neural, native } = load();
    await expect(neural.selectVoice('pocket-tts-x', 0, '')).rejects.toThrow('recorded voice sample');
    expect(await neural.selectVoice('pocket-tts-x', 0, 'ref-1')).toBe(3);
    native.activateClonedVoice.mockResolvedValueOnce(0);
    await expect(neural.selectVoice('pocket-tts-x', 0, 'ref-2')).rejects.toThrow('superseded');
    const old = load({ activateClonedVoice: undefined });
    await expect(old.neural.selectVoice('pocket-tts-x', 0, 'ref-1')).rejects.toThrow('updated Android');
  });

  it('deletes a voice, switching away from it first when it is the saved one', async () => {
    const { neural, native, store } = load();
    await neural.selectVoice('piper-amy', 0);
    await neural.deleteVoice('piper-amy');
    expect(native.deleteNeuralVoice).toHaveBeenCalledWith('piper-amy');
    expect(store.getState().neuralVoice).toBe('');
    await neural.deleteVoice('other');
  });

  it('restores the saved voice after a restart, or forgets it when it will not load', async () => {
    const { neural, native, store } = load();
    await neural.restoreVoice();
    expect(native.setNeuralVoice).not.toHaveBeenCalled();
    store.getState().setNeural('kokoro-en', 2, '');
    await neural.restoreVoice();
    expect(native.setNeuralVoice).toHaveBeenCalled();
    native.setNeuralVoice.mockRejectedValueOnce(new Error('gone'));
    await neural.restoreVoice();
    expect(store.getState().neuralVoice).toBe('');
    await load(null).neural.restoreVoice();
  });

  it('switches to an agent\'s own voice for speech and puts the saved voice back', async () => {
    const { neural, native, store } = load();
    store.getState().setNeural('piper-amy', 0, '');
    await neural.selectVoice('piper-amy', 0);
    native.setNeuralVoice.mockClear();
    await neural.loadVoiceForSpeech('piper-amy', 0);
    expect(native.setNeuralVoice).not.toHaveBeenCalled();
    await neural.loadVoiceForSpeech('kokoro-en', 2);
    expect(native.setNeuralVoice).toHaveBeenCalledTimes(1);
    await expect(neural.loadVoiceForSpeech('pocket-tts-x', 0, '')).rejects.toThrow('no reference WAV');
    native.setNeuralVoice.mockRejectedValueOnce(new Error('load failed'));
    await expect(neural.loadVoiceForSpeech('piper-ryan', 0)).rejects.toThrow('load failed');
    await neural.restoreSavedVoice();
    await load(null).neural.loadVoiceForSpeech('piper-amy', 0);
  });
});

describe('host voices and labels', () => {
  const phone = [{ name: 'en-us-x-aaa-local' }, { name: 'en-us-x-bbb-local' }, { name: 'en-gb-x-ccc-local' }, { name: 'extra' }];

  it('gives hosts distinct Kokoro speakers, or the first phone voices, and honours the person\'s own pick', () => {
    const { neural, store } = load();
    expect(neural.hostVoices(phone)).toEqual(['en-us-x-aaa-local', 'en-us-x-bbb-local', 'en-gb-x-ccc-local']);
    store.getState().setNeural('kokoro-en', 1, '');
    const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `v${i}` }));
    const auto = neural.defaultHostVoices(eleven);
    expect(auto).toHaveLength(3);
    expect(auto[0]).toBe('sid:1');
    store.setState({ podcastVoices: ['v2', 'not-installed', undefined] });
    expect(neural.hostVoices(eleven)[0]).toBe('v2');
    expect(neural.hostVoices(eleven)[1]).toBe(auto[1]);
  });

  it('labels voices readably', () => {
    const { neural, store } = load();
    store.getState().setNeural('kokoro-en', 0, '');
    expect(neural.voiceLabel('sid:5', 0)).toBe('Adam (US)');
    expect(neural.voiceLabel('sid:99', 0)).toBe('Voice 100');
    expect(neural.voiceLabel('en-us-x-sfg-network', 0)).toBe('US SFG');
    expect(neural.voiceLabel('a-very-long-voice-name-indeed', 2)).toBe('Voice 3');
    expect(neural.voiceLabel('short', 0)).toBe('short');
    store.getState().setNeural('piper-amy', 0, '');
    expect(neural.voiceLabel('sid:5', 0)).toBe('Voice 6');
  });
});

export {};
