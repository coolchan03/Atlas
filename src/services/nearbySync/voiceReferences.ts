/**
 * Cloned-voice samples across paired phones. The voice list and each sample's name and length sync like any other
 * store; this sends the sample audio itself, over the same encrypted link as recordings. A sample is about a
 * megabyte at most, so it goes in one piece, checked by a checksum and then by the voice engine, which refuses
 * anything that is not a usable voice sample. A phone never overwrites a sample it already has.
 */
import { NativeModules, Platform } from 'react-native';
import { sha256 } from 'js-sha256';

const ID = /^[a-f0-9-]{36}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_BASE64 = 4_500_000;

export interface VoiceRefChunk { kind: 'voiceref'; id: string; data: string; checksum: string }

const engine = (): any => (Platform.OS === 'android' ? NativeModules.AtlasTts : undefined);
const available = (): boolean => !!engine()?.listVoiceReferences && !!engine()?.readVoiceReference && !!engine()?.writeVoiceReference;

/** Ids of the voice samples stored on this phone. */
export async function voiceRefsOnPhone(): Promise<string[]> {
  if (!available()) return [];
  const ids: unknown = await engine().listVoiceReferences();
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && ID.test(id)) : [];
}

/** Sends each sample the other phone does not have. Returns how many were sent. */
export async function sendMissingVoiceRefs(theirs: string[] | undefined, send: (chunk: VoiceRefChunk) => Promise<void>): Promise<number> {
  if (!Array.isArray(theirs) || !available()) return 0;
  const have = new Set(theirs);
  let sent = 0;
  for (const id of await voiceRefsOnPhone()) {
    if (have.has(id)) continue;
    const data: string = await engine().readVoiceReference(id);
    if (!data || data.length > MAX_BASE64) continue;
    await send({ kind: 'voiceref', id, data, checksum: sha256(data) });
    sent++;
  }
  return sent;
}

/** Keeps a received sample after checking it. Returns false when this phone already has that sample. */
export async function receiveVoiceRef(chunk: VoiceRefChunk): Promise<boolean> {
  const { id, data, checksum } = chunk;
  if (!available()) throw new Error('Voice cloning is not available on this phone.');
  if (!ID.test(id) || typeof data !== 'string' || !data || data.length > MAX_BASE64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
      !DIGEST.test(checksum)) throw new Error('Damaged voice sample.');
  if (sha256(data) !== checksum) throw new Error('Voice sample checksum mismatch.');
  return !!(await engine().writeVoiceReference(id, data));
}
