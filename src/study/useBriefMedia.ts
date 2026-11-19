/**
 * The daily briefing in the phone's media controls: while it plays or is paused, the notification shows it with previous, play or pause, next
 * and stop, so it can be paused from the lock screen or the notification shade while the app is closed. A press does what the same button on
 * the briefing screen does. The notification is shared with Read Aloud and the music player (see mediaOwner).
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { claimMedia, ownsMedia, releaseMedia } from '../atlasVoice/mediaOwner';

export type BriefMediaState = 'off' | 'playing' | 'paused';
export interface BriefMediaActions { onPlay: () => void; onPause: () => void; onStop: () => void; onJump: (delta: number) => void }

export function useBriefMedia(state: BriefMediaState, place: { line: number; total: number }, actions: BriefMediaActions): void {
  const { line, total } = place;
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const native = NativeModules.AtlasMediaControls;
    if (!native?.show || state === 'off') return;
    claimMedia('briefing');
    native.show('Daily briefing', `Part ${Math.min(line + 1, Math.max(total, 1))} of ${total}`, state === 'playing');
    native.keepAlive?.(state === 'playing');
  }, [state, line, total]);
  useEffect(() => {
    const native = NativeModules.AtlasMediaControls;
    if (!native?.show) return;
    const sub = new NativeEventEmitter(native).addListener('AtlasMediaAction', (e: { action: string }) => {
      if (!ownsMedia('briefing')) return;
      const a = latest.current;
      if (e.action === 'play') a.onPlay(); else if (e.action === 'pause') a.onPause(); else if (e.action === 'next') a.onJump(1); else if (e.action === 'previous') a.onJump(-1); else a.onStop();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (state !== 'off') return;
    if (releaseMedia('briefing')) { const native = NativeModules.AtlasMediaControls; native?.keepAlive?.(false); native?.hide?.(); }
  }, [state]);
}
