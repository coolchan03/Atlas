/** The background music player with a fake audio graph: crossfades, pause and resume, tracks, speech ducking and interruptions. */
type Handler = (v: unknown) => void;

function load(opts: { decodeFails?: boolean; resumeFails?: boolean; noInterruptionApi?: boolean } = {}) {
  jest.resetModules();
  const state = { time: 10, ctxState: 'running', created: 0 };
  const param = () => ({ value: 0.5, cancelScheduledValues: jest.fn(), setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() });
  const sources: any[] = [];
  const appHandlers: Record<string, Handler> = {};
  const interruptionHandlers: Handler[] = [];
  class FakeContext {
    state = state.ctxState;
    destination = {};
    constructor() { state.created++; }
    get currentTime() { return state.time; }
    resume = jest.fn(async () => { if (opts.resumeFails && state.created === 1) throw new Error('route died'); this.state = 'running'; });
    close = jest.fn(async () => undefined);
    decodeAudioData = jest.fn(async (path: string) => { if (opts.decodeFails) throw new Error('bad wav'); return { duration: 120, path }; });
    createGain = () => ({ gain: param(), connect: jest.fn() });
    createBufferSource = () => { const s: any = { loop: false, buffer: null, connect: jest.fn(), start: jest.fn(), stop: jest.fn(), onEnded: null }; sources.push(s); return s; };
  }
  jest.doMock('react-native-audio-api', () => ({
    AudioContext: FakeContext,
    AudioManager: {
      observeAudioInterruptions: () => { if (opts.noInterruptionApi) throw new Error('old'); },
      addSystemEventListener: (_n: string, fn: Handler) => { interruptionHandlers.push(fn); return { remove: jest.fn() }; },
    },
  }));
  jest.doMock('../../../src/services/audioSessionManager', () => ({ audioSessionManager: { ensurePlayback: async () => undefined } }));
  const rn = require('react-native');
  jest.spyOn(rn.AppState, 'addEventListener').mockImplementation(((name: string, fn: Handler) => { appHandlers[name] = fn; return { remove: jest.fn() }; }) as never);
  const mod = require('../../../src/music/backgroundPlayer');
  const library = require('../../../src/music/library').useMusicLibrary;
  const speech = require('../../../src/music/speechActivity');
  const track = (id: string, path = `/music/${id}.wav`) => ({ id, title: id, path, scorePath: `/music/${id}.json`, mood: 'calm', sound: 'piano', seconds: 120, createdAt: '2026-01-01' });
  return { player: mod.instrumentalPlayer, playback: mod.useMusicPlayback, library, speech, track, state, sources, appHandlers, interruptionHandlers };
}

describe('playing', () => {
  it('refuses a track without a file', async () => {
    const { player, track } = load();
    await expect(player.play({ ...track('a'), path: '' })).rejects.toThrow('No saved instrumental WAV');
  });

  it('plays a track, fades the old one out when another starts, and reuses a decoded file', async () => {
    const { player, playback, track, sources } = load();
    await player.play(track('a'));
    expect(playback.getState()).toMatchObject({ playing: true, paused: false, error: null });
    expect(playback.getState().current.id).toBe('a');
    await player.play(track('b'));
    expect(sources).toHaveLength(2);
    expect(sources[0].stop).toHaveBeenCalled();
    await player.play(track('b'), 30);
    expect(sources[2].start).toHaveBeenCalledWith(0, 30);
    await player.play(track('b'), 500);
    expect(sources[3].start.mock.calls[0][1]).toBeLessThan(120);
    await player.dispose();
  });

  it('keeps the earlier error state when a decode fails, and reports it', async () => {
    const { player, playback, track } = load({ decodeFails: true });
    await expect(player.play(track('a'))).rejects.toThrow('bad wav');
    expect(playback.getState().error).toBe('bad wav');
  });

  it('starts again on a fresh context when the old one cannot resume', async () => {
    const { player, playback, track, state } = load({ resumeFails: true });
    state.ctxState = 'suspended';
    await player.play(track('a'));
    expect(playback.getState().playing).toBe(true);
    expect(state.created).toBe(2);
  });

  it('ignores a play that lost to a newer stop while it was decoding', async () => {
    const { player, playback, track } = load();
    const slow = player.play(track('a'));
    player.stop();
    await slow;
    expect(playback.getState().playing).toBe(false);
  });
});

describe('controls', () => {
  it('pauses where it was, resumes from there, and stops', async () => {
    const { player, playback, track, state, sources } = load();
    await player.play(track('a'));
    state.time = 40;
    player.pause();
    expect(playback.getState()).toMatchObject({ playing: false, paused: true });
    await player.resume();
    expect(sources[1].start.mock.calls[0][1]).toBeGreaterThan(0);
    await player.resume(); // already playing: nothing
    expect(sources).toHaveLength(2);
    player.stop();
    expect(playback.getState()).toMatchObject({ playing: false, paused: false });
    player.pause(); // nothing playing: nothing happens
    await player.dispose();
  });

  it('does nothing to resume when no track was ever played', async () => {
    const { player, sources } = load();
    await player.resume();
    expect(sources).toHaveLength(0);
  });

  it('goes to the next and previous track in the library, wrapping around', async () => {
    const { player, playback, library, track } = load();
    await player.next(); // empty library
    await player.previous();
    library.setState({ tracks: [track('a'), track('b'), track('c')] });
    await player.next();
    expect(playback.getState().current.id).toBe('b');
    await player.previous();
    await player.previous();
    expect(playback.getState().current.id).toBe('c');
    await player.next();
    expect(playback.getState().current.id).toBe('a');
    await player.dispose();
  });

  it('sets the volume (clamped) and loop in the library, and applies loop to the playing source', async () => {
    const { player, library, track, sources } = load();
    await player.play(track('a'));
    player.setVolume(5);
    expect(library.getState().volume).toBeLessThanOrEqual(1);
    player.setLoop(false);
    expect(library.getState().loop).toBe(false);
    expect(sources[0].loop).toBe(false);
    await player.dispose();
  });

  it('ends the playing state when the track finishes by itself', async () => {
    const { player, playback, track, sources } = load();
    await player.play(track('a'));
    sources[0].onEnded();
    expect(playback.getState().playing).toBe(false);
    await player.play(track('b'));
    await player.play(track('c'));
    sources[1].onEnded(); // an old source ending after a newer one took over changes nothing
    expect(playback.getState().playing).toBe(true);
    await player.dispose();
  });
});

describe('listening to the phone', () => {
  it('lowers the music while speech plays, and pauses when the app goes to the background or a call comes in', async () => {
    const { player, playback, track, speech, appHandlers, interruptionHandlers, sources } = load();
    await player.play(track('a'));
    speech.markSpeechStarted('utt');
    expect(playback.getState().ducked).toBe(true);
    speech.markSpeechFinished('utt');
    expect(playback.getState().ducked).toBe(false);
    appHandlers.change('active');
    expect(playback.getState().playing).toBe(true);
    appHandlers.change('background');
    expect(playback.getState().paused).toBe(true);
    await player.resume();
    interruptionHandlers[0]({ type: 'ended' });
    expect(playback.getState().playing).toBe(true);
    interruptionHandlers[0]({ type: 'began' });
    expect(playback.getState().paused).toBe(true);
    expect(sources.length).toBeGreaterThan(1);
    await player.dispose();
  });

  it('works on an older audio API without interruption events', async () => {
    const { player, playback, track } = load({ noInterruptionApi: true });
    await player.play(track('a'));
    expect(playback.getState().playing).toBe(true);
    await player.dispose();
  });
});
