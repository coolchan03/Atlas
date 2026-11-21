/**
 * Music in the phone's media controls and in the background. While a track plays or is paused, the notification shows its title with
 * previous, play or pause, and next; presses (and a headset or lock-screen button) drive the same player as the screen. While it PLAYS,
 * Atlas asks to be held in the foreground so the music goes on with the screen off or the app closed from the recent apps (if the person
 * left "keep playing in the background" on). The pieces are injected so this is tested without a phone.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';
import { claimMedia, ownsMedia, releaseMedia } from '../atlasVoice/mediaOwner';
import { useMusicLibrary } from './library';
import { instrumentalPlayer, useMusicPlayback } from './backgroundPlayer';

export interface MusicNative { show: (title: string, text: string, playing: boolean) => void; hide: () => void; keepAlive?: (on: boolean) => void }
interface PlaybackView { current: { title: string } | null; playing: boolean; paused: boolean }
interface ControlledPlayer {
  getState: () => PlaybackView;
  subscribe: (listener: () => void) => () => void;
  play: () => void; pause: () => void; stop: () => void; next: () => void; previous: () => void;
}

/** What the notification says, or null when no track is loaded. */
export function musicNotification(s: PlaybackView): { title: string; text: string; playing: boolean } | null {
  if (!s.current || (!s.playing && !s.paused)) return null;
  return { title: s.current.title || 'Music', text: 'Atlas Music Studio', playing: s.playing };
}

export function startMusicControls(player: ControlledPlayer, native: MusicNative, keepInBackground: () => boolean): { press: (a: string) => void; stop: () => void } {
  let last = '';
  const sync = () => {
    const state = player.getState();
    const n = musicNotification(state);
    const key = JSON.stringify([n, n && state.playing && keepInBackground()]);
    if (key === last) return;
    last = key;
    if (n) {
      claimMedia('music');
      native.show(n.title, n.text, n.playing);
      native.keepAlive?.(n.playing && keepInBackground());
    } else if (releaseMedia('music')) { native.keepAlive?.(false); native.hide(); }
  };
  const off = player.subscribe(sync);
  sync();
  const press = (action: string) => {
    if (!ownsMedia('music')) return; // the reader owns the controls right now
    if (action === 'play') player.play();
    else if (action === 'pause') player.pause();
    else if (action === 'next') player.next();
    else if (action === 'previous') player.previous();
    else if (action === 'stop') player.stop();
  };
  return { press, stop: () => { off(); if (releaseMedia('music')) { native.keepAlive?.(false); native.hide(); } } };
}

/** Connects the real player to the phone's controls (Android, where the native module exists). Call once at start-up. */
export function connectMusicControls(): void {
  const native = NativeModules.AtlasMediaControls;
  if (!native?.show) return;
  const controls = startMusicControls({
    getState: useMusicPlayback.getState,
    subscribe: (fn) => {
      const a = useMusicPlayback.subscribe(fn);
      const b = useMusicLibrary.subscribe(fn); // the "keep playing in the background" switch
      return () => { a(); b(); };
    },
    play: () => { void instrumentalPlayer.resume(); },
    pause: () => instrumentalPlayer.pause(),
    stop: () => instrumentalPlayer.stop(),
    next: () => { void instrumentalPlayer.next(); },
    previous: () => { void instrumentalPlayer.previous(); },
  }, native, () => useMusicLibrary.getState().background);
  new NativeEventEmitter(native).addListener('AtlasMediaAction', (e: { action: string }) => controls.press(e.action));
}
