/**
 * Lock-screen and notification controls for Read Aloud. The phone shows play, pause, previous, next and stop; a press comes back as an
 * "AtlasMediaAction" and is turned into the same call the buttons on the Read Aloud screen make. The notification follows the reader:
 * shown while reading or paused (with the piece being read), removed when reading ends. The pieces are injected so this is tested without a phone.
 */
import type { ReaderStatus } from './readerStatus';

export interface ControlledReader {
  getState: () => { status: ReaderStatus; title: string; parts: string[]; index: number };
  subscribe: (listener: () => void) => () => void;
  play: () => void; pause: () => void; stop: () => void; jump: (delta: number) => void;
}
export interface NativeControls { show: (title: string, text: string, playing: boolean) => void; hide: () => void }
export type MediaAction = 'play' | 'pause' | 'next' | 'previous' | 'stop';

/** What the notification says for a reader state, or null when there should be none. */
export function notificationFor(s: { status: ReaderStatus; title: string; parts: string[]; index: number }): { title: string; text: string; playing: boolean } | null {
  if (s.status === 'idle' || !s.parts.length) return null;
  return { title: s.title || 'Read aloud', text: `Part ${Math.min(s.index + 1, s.parts.length)} of ${s.parts.length}`, playing: s.status === 'reading' };
}

/** Starts mirroring the reader into the notification, and returns the handler for a press. */
export function startMediaControls(reader: ControlledReader, native: NativeControls): { press: (a: MediaAction) => void; stop: () => void } {
  let last = '';
  const sync = () => {
    const n = notificationFor(reader.getState());
    const key = JSON.stringify(n);
    if (key === last) return;
    last = key;
    if (n) native.show(n.title, n.text, n.playing); else native.hide();
  };
  const off = reader.subscribe(sync);
  sync();
  const press = (a: MediaAction) => {
    if (a === 'play') reader.play();
    else if (a === 'pause') reader.pause();
    else if (a === 'next') reader.jump(1);
    else if (a === 'previous') reader.jump(-1);
    else reader.stop();
  };
  return { press, stop: () => { off(); native.hide(); } };
}
