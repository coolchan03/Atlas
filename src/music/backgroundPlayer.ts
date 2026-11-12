import { AppState } from 'react-native';
import { AudioContext, AudioManager } from 'react-native-audio-api';
import { create } from 'zustand';
import { audioSessionManager } from '../services/audioSessionManager';
import { hasActiveSpeech, watchSpeechActivity } from './speechActivity';
import { useMusicLibrary, type InstrumentalTrack } from './library';
import { clampMusicVolume, CROSSFADE_SECONDS, effectiveMusicGain, playbackOffset } from './playerPolicy';

interface MusicPlaybackState {
  current: InstrumentalTrack | null;
  playing: boolean;
  paused: boolean;
  error: string | null;
  ducked: boolean;
}
export const useMusicPlayback = create<MusicPlaybackState>(() => ({
  current: null, playing: false, paused: false, error: null, ducked: false,
}));

/** One persistent player per app runtime. Navigation never owns, closes or resets its audio graph. */
class InstrumentalBackgroundPlayer {
  private context: AudioContext | null = null;
  private source: any = null;
  private gain: any = null;
  private currentBuffer: any = null;
  private currentPath = '';
  private startedAt = 0;
  private pauseOffset = 0;
  private operation = 0;
  private observed = false;
  private removingListeners: Array<() => void> = [];

  private setupObservers(): void {
    if (this.observed) return;
    this.observed = true;
    const removeSpeech = watchSpeechActivity((active) => {
      useMusicPlayback.setState({ ducked: active });
      this.applyVolume(0.22);
    });
    const unsubscribeVolume = useMusicLibrary.subscribe((state, previous) => {
      if (state.volume !== previous.volume) this.applyVolume(0.2);
      if (state.loop !== previous.loop && this.source) this.source.loop = state.loop;
    });
    // In-app navigation is supported. Backgrounding Atlas pauses playback; no unrequested
    // Android foreground service, lock-screen player, or long-running audio notification.
    const app = AppState.addEventListener('change', (value) => {
      if (value !== 'active') this.pause();
    });
    try {
      AudioManager.observeAudioInterruptions(true);
      const interruption = AudioManager.addSystemEventListener('interruption', (event) => {
        if (event.type === 'began') this.pause();
        // Do not auto-resume into a phone call after interruption ends.
      });
      if (interruption) this.removingListeners.push(() => interruption.remove());
    } catch { /* older audio API, normal playback still works */ }
    this.removingListeners.push(removeSpeech, unsubscribeVolume, () => app.remove());
  }

  private applyVolume(seconds: number): void {
    if (!this.gain || !this.context) return;
    const target = effectiveMusicGain(useMusicLibrary.getState().volume, hasActiveSpeech());
    const at = this.context.currentTime;
    try {
      this.gain.gain.cancelScheduledValues(at);
      this.gain.gain.setValueAtTime(this.gain.gain.value, at);
      this.gain.gain.linearRampToValueAtTime(target, at + seconds);
    } catch { this.gain.gain.value = target; }
  }

  private ensureContext = async (): Promise<AudioContext> => {
    await audioSessionManager.ensurePlayback();
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    try {
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // Android route-change recovery: never reuse an irrecoverably suspended AudioContext.
      try { await this.context.close(); } catch { /* old output route died */ }
      this.context = new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
      this.currentPath = '';
      this.currentBuffer = null;
    }
    return this.context;
  };

  /** Play an existing WAV with a smooth crossfade. Failed decodes leave the prior track playing. */
  async play(track: InstrumentalTrack, resumeOffset = 0): Promise<void> {
    if (!track?.path) throw new Error('No saved instrumental WAV');
    this.setupObservers();
    const request = ++this.operation;
    try {
      const ctx = await this.ensureContext();
      const decoded = this.currentPath === track.path && this.currentBuffer
        ? this.currentBuffer : await ctx.decodeAudioData(track.path.startsWith('file://') ? track.path : `file://${track.path}`);
      if (request !== this.operation) return; // newer play/stop/pause won during decoding
      const next = ctx.createBufferSource();
      next.buffer = decoded;
      next.loop = useMusicLibrary.getState().loop;
      const nextGain = ctx.createGain();
      nextGain.gain.value = 0;
      next.connect(nextGain);
      nextGain.connect(ctx.destination);
      const old = this.source, oldGain = this.gain;
      const now = ctx.currentTime;
      const fade = old ? CROSSFADE_SECONDS : 0.2;
      nextGain.gain.setValueAtTime(0, now);
      nextGain.gain.linearRampToValueAtTime(effectiveMusicGain(useMusicLibrary.getState().volume, hasActiveSpeech()), now + fade);
      this.source = next;
      this.gain = nextGain;
      this.currentBuffer = decoded;
      this.currentPath = track.path;
      this.startedAt = now - resumeOffset;
      this.pauseOffset = 0;
      next.onended = () => {
        if (this.source !== next) return;
        this.source = null;
        this.gain = null;
        useMusicPlayback.setState({ playing: false, paused: false });
      };
      next.start(0, Math.max(0, Math.min(resumeOffset, Math.max(0, decoded.duration - 0.05))));
      if (old && oldGain) {
        try {
          oldGain.gain.cancelScheduledValues(now);
          oldGain.gain.setValueAtTime(oldGain.gain.value, now);
          oldGain.gain.linearRampToValueAtTime(0, now + fade);
          old.stop(now + fade + 0.02);
        } catch { try { old.stop(); } catch { /* ended */ } }
      }
      useMusicPlayback.setState({ current: track, playing: true, paused: false, error: null });
    } catch (error: any) {
      if (request === this.operation) useMusicPlayback.setState({ error: String(error?.message || error) });
      throw error;
    }
  }

  pause(): void {
    ++this.operation;
    if (!this.source) return;
    const state = useMusicPlayback.getState();
    const duration = state.current?.seconds || this.currentBuffer?.duration || 0;
    const elapsed = (this.context?.currentTime || 0) - this.startedAt;
    this.pauseOffset = playbackOffset(elapsed, duration);
    try { this.source.stop(); } catch { /* already stopped */ }
    this.source = null;
    this.gain = null;
    useMusicPlayback.setState({ playing: false, paused: true });
  }

  async resume(): Promise<void> {
    const state = useMusicPlayback.getState();
    if (!state.current || state.playing) return;
    await this.play(state.current, this.pauseOffset);
  }

  stop(): void {
    ++this.operation;
    try { this.source?.stop(); } catch { /* ended */ }
    this.source = null;
    this.gain = null;
    this.pauseOffset = 0;
    useMusicPlayback.setState({ playing: false, paused: false });
  }

  setVolume(volume: number): void { useMusicLibrary.getState().setVolume(clampMusicVolume(volume)); }
  setLoop(loop: boolean): void { useMusicLibrary.getState().setLoop(loop); }

  async next(): Promise<void> {
    const state = useMusicPlayback.getState();
    const tracks = useMusicLibrary.getState().tracks;
    if (!tracks.length) return;
    const at = Math.max(0, tracks.findIndex((t) => t.id === state.current?.id));
    await this.play(tracks[(at + 1) % tracks.length]);
  }

  async previous(): Promise<void> {
    const state = useMusicPlayback.getState();
    const tracks = useMusicLibrary.getState().tracks;
    if (!tracks.length) return;
    const at = Math.max(0, tracks.findIndex((t) => t.id === state.current?.id));
    await this.play(tracks[(at - 1 + tracks.length) % tracks.length]);
  }

  /** Used by dev/test cleanup, not called on navigation. */
  async dispose(): Promise<void> {
    this.stop();
    this.removingListeners.splice(0).forEach((fn) => fn());
    this.observed = false;
    if (this.context) await this.context.close().catch(() => undefined);
    this.context = null;
    this.currentBuffer = null;
    this.currentPath = '';
  }
}
export const instrumentalPlayer = new InstrumentalBackgroundPlayer();
