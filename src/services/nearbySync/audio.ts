/**
 * Recording audio for offline sync. Audio files are too big for the main sync message, so
 * after the records are exchanged, each phone sends the recordings the other one lacks, in
 * pieces of a few megabytes over the same encrypted connection. The other phone writes the
 * pieces to a temporary file and moves it into place when the last one arrives.
 */
import RNFS from 'react-native-fs';

/** Raw bytes per piece (about 5.3 MB once base64-encoded, well under the 48 MB packet limit). */
export const CHUNK_BYTES = 4 * 1024 * 1024;
const ID = /^[\w-]{1,80}$/;
const dir = () => `${RNFS.DocumentDirectoryPath}/atlas-recordings`;
export const audioPathFor = (id: string) => `${dir()}/${id}.wav`;

export interface AudioChunk { kind: 'audio'; id: string; index: number; total: number; data: string }

/** Recordings whose audio is on this phone (sent so the other phone knows what to send). */
export async function audioOnPhone(ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) if (ID.test(id) && await RNFS.exists(audioPathFor(id))) out.push(id);
  return out;
}

/** Sends every recording the other phone lacks, piece by piece, through `send`. */
export async function sendMissingAudio(
  local: { id: string; audioPath: string }[], theirs: string[] | undefined,
  send: (chunk: AudioChunk) => Promise<void>,
): Promise<number> {
  if (!Array.isArray(theirs)) return 0;
  const have = new Set(theirs);
  let sent = 0;
  for (const rec of local) {
    if (!ID.test(rec.id) || have.has(rec.id) || !await RNFS.exists(rec.audioPath)) continue;
    const size = Number((await RNFS.stat(rec.audioPath)).size);
    const total = Math.max(1, Math.ceil(size / CHUNK_BYTES));
    for (let index = 0; index < total; index++) {
      const data = await RNFS.read(rec.audioPath, CHUNK_BYTES, index * CHUNK_BYTES, 'base64');
      await send({ kind: 'audio', id: rec.id, index, total, data });
    }
    sent++;
  }
  return sent;
}

const expected = new Map<string, number>();
const receiving = new Map<string, Promise<boolean>>();

/** Serializes each recording's pieces so duplicate native events cannot race file promotion. */
export async function receiveAudio(chunk: AudioChunk): Promise<boolean> {
  const previous = receiving.get(chunk.id) ?? Promise.resolve(false);
  const current = previous.catch(() => false).then(() => writeAudioChunk(chunk));
  receiving.set(chunk.id, current);
  try { return await current; }
  finally { if (receiving.get(chunk.id) === current) receiving.delete(chunk.id); }
}

/** Writes one received piece; moves the file into place after the last piece. True when complete. */
async function writeAudioChunk(chunk: AudioChunk): Promise<boolean> {
  const { id, index, total, data } = chunk;
  if (!ID.test(id) || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || index >= total || total > 4096 || typeof data !== 'string')
    throw new Error('Damaged recording piece');
  const final = audioPathFor(id);
  // Recording IDs are immutable. A late duplicate must never replace playable audio.
  if (await RNFS.exists(final)) { expected.delete(id); return true; }
  const part = `${final}.part`;
  await RNFS.mkdir(dir());
  if (index === 0) await RNFS.writeFile(part, data, 'base64');
  else if (expected.get(id) === index) await RNFS.appendFile(part, data, 'base64');
  else { expected.delete(id); throw new Error('Recording pieces arrived out of order; it is sent again next sync.'); }
  if (index + 1 < total) { expected.set(id, index + 1); return false; }
  expected.delete(id);
  if (await RNFS.exists(final)) return true;
  await RNFS.moveFile(part, final);
  return true;
}
