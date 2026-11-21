/**
 * Getting a SoundFont onto the phone and into use: reading the file in pieces (a SoundFont can be tens of megabytes, and one base64 string
 * of that size is too much), adding one the person picks, or downloading the free one, and loading the one in use before a tune is rendered.
 */
import RNFS from 'react-native-fs';
import { useMusicLibrary } from './library';
import { hasSoundfont, loadSoundfontBytes, setActiveSoundfont } from './sampled';

/** A small, free General MIDI SoundFont (TimGM6mb, GPL licence), downloaded only when the person asks. */
const FREE_SOUNDFONT = { url: 'https://raw.githubusercontent.com/craffel/pretty-midi/main/pretty_midi/TimGM6mb.sf2', name: 'TimGM6mb', approxMB: 6, /** The size of the file as published: a download far from it is not this file (moved, replaced or cut short) and is refused. */ minBytes: 5_000_000, maxBytes: 7_500_000 };
/**
 * Free General MIDI SoundFonts the person can download, smallest first. A bigger set has more lifelike recordings but takes more
 * space and memory while a tune is made (the whole file is read), so each says what it costs. Sizes are those of the published
 * files: a download far from them is not that file (moved, replaced or cut short) and is refused.
 */
export interface SoundfontChoice { id: string; name: string; url: string; approxMB: number; minBytes: number; maxBytes: number; note: string }
export const SOUNDFONT_CHOICES: SoundfontChoice[] = [
  { id: 'timgm6mb', name: FREE_SOUNDFONT.name, url: FREE_SOUNDFONT.url, approxMB: FREE_SOUNDFONT.approxMB, minBytes: FREE_SOUNDFONT.minBytes, maxBytes: FREE_SOUNDFONT.maxBytes, note: 'Small and quick. Good for trying real instruments (GPL licence).' },
  { id: 'generaluser', name: 'GeneralUser GS', url: 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2', approxMB: 32, minBytes: 30_000_000, maxBytes: 36_000_000, note: 'Recommended: far more natural pianos, guitars, strings, horns and drums (free to use).' },
  { id: 'fluidr3', name: 'FluidR3 GM', url: 'https://github.com/pianobooster/fluid-soundfont/releases/download/v3.1/FluidR3_GM.sf2', approxMB: 148, minBytes: 140_000_000, maxBytes: 152_000_000, note: 'Largest and richest (MIT licence). Needs about 150 MB of free space and memory; best on a phone with plenty of RAM.' },
];
const MAX_BYTES = 150 * 1024 * 1024;
const PIECE = 3 * 1024 * 1024; // a multiple of 3, so each piece is whole base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => { const t = new Uint8Array(128).fill(255); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; return t; })();

/** Bytes of a base64 string. */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]; const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0; const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    if (o < out.length) out[o++] = (a << 2) | (b >> 4);
    if (o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

/** The whole file as bytes, read a piece at a time. */
async function readFileBytes(path: string): Promise<Uint8Array> {
  const size = Number((await RNFS.stat(path)).size);
  if (size > MAX_BYTES) throw new Error('That file is too big to use (over 150 MB).');
  const out = new Uint8Array(size);
  for (let at = 0; at < size; at += PIECE) {
    const piece = fromBase64(await RNFS.read(path, Math.min(PIECE, size - at), at, 'base64'));
    out.set(piece, at);
  }
  return out;
}

/** Whether the start of a file says it is a SoundFont 2. */
export const looksLikeSoundfont = (head: Uint8Array): boolean => head.length >= 12 && String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'sfbk';

async function checkFile(path: string): Promise<number> {
  const head = fromBase64(await RNFS.read(path, 12, 0, 'base64'));
  if (!looksLikeSoundfont(head)) throw new Error('That is not a SoundFont (.sf2) file.');
  return Number((await RNFS.stat(path)).size);
}

const dir = () => `${RNFS.DocumentDirectoryPath}/soundfonts`;

/**
 * Keeps a file as the SoundFont in use. It is checked first, then put beside the old one under a temporary name and swapped in only once
 * it is all there, so a wrong file, a full disk or a lost connection leaves the working SoundFont as it was. `move` takes the file itself
 * instead of copying it (for one just downloaded into the app's own folder).
 * @public Reached by name through require() (tests, other modules): the export is used.
 */
export async function installSoundfontFrom(path: string, name: string, o: { move?: boolean } = {}): Promise<void> {
  const bytes = await checkFile(path);
  if (bytes > MAX_BYTES) throw new Error('That file is too big to use (over 150 MB).');
  await RNFS.mkdir(dir());
  const to = `${dir()}/active.sf2`;
  const incoming = `${dir()}/incoming.sf2`;
  try {
    if (o.move) await RNFS.moveFile(path, incoming); else await RNFS.copyFile(path, incoming);
    if (Number((await RNFS.stat(incoming)).size) !== bytes) throw new Error('The file was not copied completely. Try again.');
    if (await RNFS.exists(to)) await RNFS.unlink(to);
    await RNFS.moveFile(incoming, to);
  } finally { await RNFS.unlink(incoming).catch(() => undefined); }
  setActiveSoundfont(null);
  useMusicLibrary.getState().setSoundfont({ name: name.replace(/\.sf2$/i, ''), path: to, bytes });
  useMusicLibrary.getState().setUseSoundfont(true);
}

/** Downloads the small free SoundFont and keeps it. `onProgress` gets 0 to 1. @public */
export const downloadFreeSoundfont = (onProgress?: (share: number) => void): Promise<void> => downloadSoundfont(SOUNDFONT_CHOICES[0], onProgress);

/** Downloads one of the SoundFonts above and keeps it as the one in use. `onProgress` gets 0 to 1. */
export async function downloadSoundfont(choice: SoundfontChoice, onProgress?: (share: number) => void): Promise<void> {
  await RNFS.mkdir(dir());
  const tmp = `${dir()}/download.sf2`;
  const job = RNFS.downloadFile({ fromUrl: choice.url, toFile: tmp, progressInterval: 400, progress: (p) => onProgress?.(p.contentLength > 0 ? p.bytesWritten / p.contentLength : 0) });
  const res = await job.promise;
  try {
    if (res.statusCode !== 200) throw new Error(`The download failed (server said ${res.statusCode}).`);
    const size = Number((await RNFS.stat(tmp)).size);
    if (size < choice.minBytes || size > choice.maxBytes) throw new Error('The downloaded file is not the instruments that were expected (the address may have changed). Choose a SoundFont file yourself instead.');
    await installSoundfontFrom(tmp, choice.name, { move: true });
  } finally { await RNFS.unlink(tmp).catch(() => undefined); }
}

/** The file picker, then install: for the "Choose a SoundFont file" button. Resolves quietly when the picker is closed. */
export async function pickAndInstallSoundfont(): Promise<void> {
  const { pick, isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
  const { resolvePickedFileUri } = require('../utils/resolvePickedFileUri');
  try {
    const [file] = await pick({ mode: 'open', allowMultiSelection: false });
    if (!file) return;
    await installSoundfontFrom(await resolvePickedFileUri(file.uri, file.name || 'instruments.sf2'), file.name || 'instruments');
  } catch (e: any) { if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) throw e; }
}

/** Switch between the real instruments and the built-in synthesiser without removing the SoundFont. */
export function setRealInstruments(on: boolean): void { useMusicLibrary.getState().setUseSoundfont(on); }

export function removeSoundfont(): void {
  const sf = useMusicLibrary.getState().soundfont;
  setActiveSoundfont(null);
  loadedPath = '';
  useMusicLibrary.getState().setSoundfont(null);
  if (sf) RNFS.unlink(sf.path).catch(() => undefined);
}

let loadedPath = '';
/**
 * Makes the SoundFont the person chose the one the renderer uses (reading it the first time), or none. Returns what happened in words for the
 * progress line. Never throws: a file that cannot be read means the built-in synthesiser plays, and the reason is returned.
 */
export async function prepareInstruments(): Promise<{ real: boolean; note: string }> {
  const { soundfont, useSoundfont } = useMusicLibrary.getState();
  if (!soundfont || !useSoundfont) { setActiveSoundfont(null); loadedPath = ''; return { real: false, note: 'the built-in synthesiser' }; }
  if (loadedPath === soundfont.path && hasSoundfont()) return { real: true, note: `real instruments (${soundfont.name})` };
  try {
    loadSoundfontBytes(await readFileBytes(soundfont.path));
    loadedPath = soundfont.path;
    return { real: true, note: `real instruments (${soundfont.name})` };
  } catch (e) {
    setActiveSoundfont(null); loadedPath = '';
    return { real: false, note: `the built-in synthesiser (the real instruments could not be read: ${String((e as Error)?.message || e).slice(0, 80)})` };
  }
}
