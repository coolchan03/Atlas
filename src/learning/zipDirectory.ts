/**
 * Reads a ZIP's table of contents (its central directory) WITHOUT unpacking anything, so the size and file-count limits are checked
 * before a single byte is written. A zip that claims too many files, too large a total, or paths that leave the folder is refused here.
 * The parsing is pure (bytes in, entries out); only `readZipDirectory` touches the file.
 */
import RNFS from 'react-native-fs';

export interface ZipEntryInfo { name: string; compressed: number; size: number }


const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const MAX_DIRECTORY_BYTES = 8 * 1024 * 1024;
/** The end-of-central-directory record is within the last 22 + 65535 bytes. */
const TAIL_BYTES = 22 + 65535;

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Where the central directory is, from the last bytes of the file. Throws for a file that is not a zip, or a zip64 one (refused: sizes cannot be bounded here). */
export function parseEndRecord(tail: Uint8Array): { entries: number; size: number; offset: number } {
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (u32(tail, i) !== EOCD_SIG) continue;
    const entries = u16(tail, i + 10);
    const size = u32(tail, i + 12);
    const offset = u32(tail, i + 16);
    if (entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new Error('This zip uses the zip64 format, which Atlas does not open. Re-pack it as an ordinary zip, or add the files one by one.');
    return { entries, size, offset };
  }
  throw new Error('That file is not a readable zip.');
}

/** The entries listed in a central directory. Throws when it is cut off or damaged. */
export function parseCentralDirectory(cd: Uint8Array, count: number): ZipEntryInfo[] {
  const out: ZipEntryInfo[] = [];
  let at = 0;
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > cd.length || u32(cd, at) !== CD_SIG) throw new Error('This zip is damaged (its list of files is unreadable).');
    const compressed = u32(cd, at + 20);
    const size = u32(cd, at + 24);
    const nameLength = u16(cd, at + 28);
    const extraLength = u16(cd, at + 30);
    const commentLength = u16(cd, at + 32);
    if (at + 46 + nameLength > cd.length) throw new Error('This zip is damaged (its list of files is cut off).');
    const name = new TextDecoder('utf-8').decode(cd.subarray(at + 46, at + 46 + nameLength));
    out.push({ name, compressed, size });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Base64 text to bytes (react-native-fs hands file reads back as base64). */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]); const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1; const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** Lists a zip's entries by reading only its end and its directory. `maxEntries` stops a zip that lists more before its directory is read. */
export async function readZipDirectory(path: string, zipBytes: number, maxEntries: number): Promise<ZipEntryInfo[]> {
  const tailLength = Math.min(zipBytes, TAIL_BYTES);
  const tail = fromBase64(await RNFS.read(path, tailLength, zipBytes - tailLength, 'base64'));
  const end = parseEndRecord(tail);
  if (end.entries > maxEntries) throw new Error(`It holds more than ${maxEntries} files.`);
  if (end.size > MAX_DIRECTORY_BYTES || end.offset + end.size > zipBytes) throw new Error('This zip is damaged (its list of files is out of bounds).');
  const cd = fromBase64(await RNFS.read(path, end.size, end.offset, 'base64'));
  return parseCentralDirectory(cd, end.entries);
}
