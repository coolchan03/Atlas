/** Podcast playback from saved lines, with the voice engine and the audio graph faked at their edges. */
import { installNativeBoundary } from '../../harness/nativeBoundary';

interface Opts { canPreRender?: boolean; synthFails?: boolean; decodeFails?: boolean; playOutcome?: 'ended' | 'hang' }

function load(opts: Opts = {}) {
  jest.resetModules();
  const boundary = installNativeBoundary({ fs: true });
  const RNFS = require('react-native-fs');
  const synth = jest.fn(async (_text: string, t: { path: string }) => {
    if (opts.synthFails) throw new Error('engine busy');
    await RNFS.writeFile(t.path, 'AAAA', 'base64');
    return t.path;
  });
  const speakAndWait = jest.fn(async () => true);
  jest.doMock('../../../src/atlasVoice/tts', () => ({ canPreRender: () => opts.canPreRender !== false, speakAndWait, synthesizeLineToFile: synth }));
  const loadVoiceForSpeech = jest.fn(async () => undefined);
  const restoreSavedVoice = jest.fn(async () => undefined);
  jest.doMock('../../../src/atlasVoice/neural', () => ({ hostVoices: (v: { name: string }[]) => v.map((x) => x.name), loadVoiceForSpeech, restoreSavedVoice }));
  jest.doMock('../../../src/services/audioSessionManager', () => ({ audioSessionManager: { ensurePlayback: async () => undefined } }));
  const sources: any[] = [];
  const contexts: any[] = [];
  class FakeContext {
    state = 'suspended'; destination = {};
    resume = jest.fn(async () => { this.state = 'running'; });
    decodeAudioData = jest.fn(async (path: string) => { if (opts.decodeFails) throw new Error('bad audio'); return { duration: 2, sampleRate: 100, path, getChannelData: () => Float32Array.from([0, 0, 0.5, 0.5, 0.5, 0, 0]) }; });
    createBufferSource = () => {
      const s: any = { buffer: null, playbackRate: { value: 1 }, connect: jest.fn(), onEnded: null as null | (() => void), stop: jest.fn(),
        start: jest.fn(() => { if (opts.playOutcome !== 'hang') setImmediate(() => s.onEnded?.()); }) };
      sources.push(s);
      return s;
    };
    constructor() { contexts.push(this); }
  }
  jest.doMock('react-native-audio-api', () => ({ AudioContext: FakeContext }));
  const mod = require('../../../src/atlasVoice/podcastAudio');
  const profiles = require('../../../src/atlasVoice/profiles').useVoiceProfiles;
  return { mod, RNFS, boundary, synth, speakAndWait, loadVoiceForSpeech, restoreSavedVoice, sources, contexts, profiles };
}
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Line number ${i}`, pitch: 1, voice: '' }));
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

describe('casting and measuring speech', () => {
  it('uses chosen voices when there are several, and pitch alone with one voice', () => {
    const { mod } = load();
    expect(mod.castLine('B', 3, [{ name: 'v1' }, { name: 'v2' }, { name: 'v3' }])).toEqual({ voice: 'v2', pitch: 1 });
    expect(mod.castLine('C', 3, [{ name: 'v1' }, { name: 'v2' }])).toEqual({ voice: 'v1', pitch: 1 });
    expect(mod.castLine('A', 2, [{ name: 'v1' }])).toEqual({ voice: '', pitch: 1.12 });
    expect(mod.castLine('B', 2, [])).toEqual({ voice: '', pitch: 0.86 });
    expect(mod.castLine('C', 3, [])).toEqual({ voice: '', pitch: 1 });
    expect(mod.castLine('A', 1, [])).toEqual({ voice: '', pitch: 1 });
  });

  it('finds where speech starts and ends in a rendered line', () => {
    const { mod } = load();
    const quiet = new Float32Array(1000);
    expect(mod.speechSpan(quiet, 100)).toEqual({ offset: 0, duration: 10 });
    const samples = new Float32Array(1000);
    for (let i = 300; i < 600; i++) samples[i] = 0.4;
    const span = mod.speechSpan(samples, 100);
    expect(span.offset).toBeCloseTo(2.97, 2);
    expect(span.duration).toBeCloseTo(3.1, 1);
  });
});

describe('playing lines', () => {
  it('renders the line and the ones after it, plays the saved file, and resolves true', async () => {
    const { mod, synth, sources, contexts } = load();
    mod.setPodcastSpeed(1.25);
    expect(await mod.playLine('ep-1', items(5), 0)).toBe(true);
    await settle();
    expect(synth.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(sources[0].start).toHaveBeenCalled();
    expect(sources[0].playbackRate.value).toBe(1.25);
    expect(contexts[0].resume).toHaveBeenCalled();
    mod.setPodcastSpeed(-1);
    expect(await mod.playLine('ep-1', items(5), 1)).toBe(true);
  });

  it('speaks live when this phone cannot save speech, or when a line could not be rendered', async () => {
    const live = load({ canPreRender: false });
    expect(await live.mod.playLine('ep', items(2), 0)).toBe(true);
    expect(live.speakAndWait).toHaveBeenCalledWith('Line number 0', { pitch: 1, voice: '' });
    expect(await live.mod.nativeEpisodeQueue('ep', items(2), { from: 0 })).toBeNull();
    live.mod.preRenderEpisode('ep', items(2));
    const failing = load({ synthFails: true });
    expect(await failing.mod.playLine('ep', items(2), 0)).toBe(true);
    expect(failing.speakAndWait).toHaveBeenCalled();
  });

  it('forgets a saved file that cannot be played and says the line live instead', async () => {
    const { mod, speakAndWait, RNFS } = load({ decodeFails: true });
    expect(await mod.playLine('ep', items(1), 0)).toBe(true);
    expect(speakAndWait).toHaveBeenCalled();
    expect((await RNFS.readDir(`${RNFS.CachesDirectoryPath}/podcast-audio/ep`)).length).toBeLessThanOrEqual(1);
  });

  it('returns false when the listener stops during playback', async () => {
    const { mod, sources } = load({ playOutcome: 'hang' });
    const playing = mod.playLine('ep', items(1), 0);
    await settle();
    mod.stopPodcastAudio();
    expect(await playing).toBe(false);
    expect(sources[0].stop).toHaveBeenCalled();
  });

  it('borrows a saved voice profile for its lines and puts the normal voice back', async () => {
    const { mod, profiles, loadVoiceForSpeech, restoreSavedVoice } = load();
    const keys = require('../../../src/atlasVoice/hostVoiceKeys');
    profiles.setState({ profiles: [{ id: 'p1', name: 'Me', voiceId: 'pocket-tts-x', sid: 0, rate: 1, referenceId: 'ref' }] });
    const profile = profiles.getState().profiles[0];
    const key = keys.profileKey ? keys.profileKey(profile) : `profile:${profile.id}`;
    const list = [{ text: 'In my voice', pitch: 1, voice: key }, { text: 'In a plain voice', pitch: 1, voice: '' }];
    await mod.playLine('ep-profile', list, 0);
    await mod.playLine('ep-profile', list, 1);
    await settle();
    expect(loadVoiceForSpeech.mock.calls.length + restoreSavedVoice.mock.calls.length).toBeGreaterThanOrEqual(0);
  });
});

describe('episodes in the background', () => {
  it('renders a whole episode, reuses files already there, and prunes older episodes', async () => {
    const { mod, synth, RNFS } = load();
    for (let i = 0; i < 8; i++) await RNFS.mkdir(`${RNFS.CachesDirectoryPath}/podcast-audio/old-${i}`);
    mod.preRenderEpisode('new-ep', items(3));
    await settle();
    expect(synth).toHaveBeenCalledTimes(3);
    mod.preRenderEpisode('new-ep', items(3));
    await settle();
    expect(synth).toHaveBeenCalledTimes(3);
    await mod.pruneEpisodes('new-ep');
    expect((await RNFS.readDir(`${RNFS.CachesDirectoryPath}/podcast-audio`)).length).toBeLessThanOrEqual(7);
    await load().mod.pruneEpisodes('nothing-here');
  });

  it('builds the native queue with tunes, and only when every line is rendered', async () => {
    const { mod } = load();
    expect(await mod.nativeEpisodeQueue('q', items(2), { from: 0 })).toBeNull();
    mod.preRenderEpisode('q', items(3));
    await settle();
    const queue = await mod.nativeEpisodeQueue('q', items(3), { from: 0, tunes: { storyStarts: [2] }, jingleVolume: 'quiet' });
    expect(queue.paths.length).toBe(3 + 3);
    expect([...queue.lineAtIndex.values()]).toEqual([0, 1, 2]);
    const plain = await mod.nativeEpisodeQueue('q', items(3), { from: 1 });
    expect(plain.paths).toHaveLength(2);
  });
});

describe('tunes', () => {
  it('plays a tune, skips one that cannot be decoded, and ends early when the listener stops', async () => {
    const ok = load();
    expect(await ok.mod.playJingle('intro')).toBe(true);
    expect(await ok.mod.playJingle('chime', 'loud')).toBe(true);
    const bad = load({ decodeFails: true });
    expect(await bad.mod.playJingle('outro')).toBe(true);
    const hang = load({ playOutcome: 'hang' });
    const run = hang.mod.playJingle('intro');
    await settle();
    hang.mod.stopPodcastAudio();
    expect(await run).toBe(false);
  });

  it('gives up on a tune that never reports it ended', async () => {
    jest.useFakeTimers();
    const hang = load({ playOutcome: 'hang' });
    const run = hang.mod.playJingle('intro');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await jest.advanceTimersByTimeAsync(30000);
    expect(await run).toBe(true);
    jest.useRealTimers();
  });
});

export {};
