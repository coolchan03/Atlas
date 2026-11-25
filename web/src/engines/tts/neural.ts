// One facade over the natural-voice engines (Kokoro, Piper) so the AtlasTts module never branches on which one.
import type { Chunk } from './pcmPlayer';
import * as kokoro from './kokoro';
import * as piper from './piper';

export const isNeural = (id: string) => kokoro.isKokoro(id) || piper.isPiper(id);
export const speakers = (id: string) => (kokoro.isKokoro(id) ? kokoro.speakerCount(id) : 1);

export async function load(id: string, onProgress?: (f: number) => void): Promise<void> {
  if (kokoro.isKokoro(id)) await kokoro.loadKokoro(onProgress);
  else if (piper.isPiper(id)) await piper.loadPiper(id, onProgress);
  else throw new Error('This voice is not available in the web build.');
}
export async function synth(text: string, id: string, sid: number, rate: number): Promise<Chunk> {
  if (kokoro.isKokoro(id)) return kokoro.synth(text, id, sid, rate);
  return piper.synthPiper(text, id);
}
/** Piper has no speed control of its own: the player speeds playback up instead. Kokoro handles speed inside. */
export const playbackRateFor = (id: string, rate: number) => (piper.isPiper(id) ? rate : 1);

export async function installed(): Promise<{ id: string; bytes: number }[]> {
  const out: { id: string; bytes: number }[] = [];
  if (kokoro.kokoroInstalled()) for (const id of kokoro.kokoroIds) out.push({ id, bytes: 92 * 1024 * 1024 });
  for (const id of await piper.installedPiper()) out.push({ id, bytes: 63 * 1024 * 1024 });
  return out;
}
export async function remove(id: string) {
  if (kokoro.isKokoro(id)) await kokoro.removeKokoro();
  else if (piper.isPiper(id)) await piper.removePiper(id);
}
