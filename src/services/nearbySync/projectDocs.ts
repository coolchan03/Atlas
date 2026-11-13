/**
 * Project documents of any size across paired phones, for textbooks that are far bigger than the 25 MB the
 * all-in-one sync message can hold. The snapshot lists the documents a phone has (`docs`); the other phone sends
 * the ones that are missing: first the document's searchable text in small batches, then the file itself in 4 MB
 * pieces written to a .part file, checked by a checksum and a size, and only then added to the project. An
 * interrupted transfer leaves nothing behind but the .part file, and a phone never replaces a document it already has.
 */
import RNFS from 'react-native-fs';
import { sha256 } from 'js-sha256';
import { ragService } from '../rag';
import { useProjectStore } from '../../stores/projectStore';

export const DOC_CHUNK_BYTES = 4 * 1024 * 1024;
/** Documents up to this size and in total travel inside the sync message as before; bigger ones are streamed. */
export const INLINE_BYTES = 8 * 1024 * 1024;
export const MAX_DOC_BYTES = 600 * 1024 * 1024;
const TEXT_BATCH_CHARS = 400_000;
const MAX_TEXT_CHUNKS = 200_000;
const DIGEST = /^[a-f0-9]{64}$/;
const ROOT = () => `${RNFS.DocumentDirectoryPath}/atlas-project-files`;
const safeId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const safeName = (name: unknown): name is string => typeof name === 'string' && name.length > 0 && name.length <= 200 && name !== '.' && name !== '..' && !/[\\/\x00-\x1f:]/.test(name);

export interface DocMeta { projectId: string; name: string; size: number; enabled: boolean; createdAt: string; /** SHA-256 of the file's bytes: two revisions with the same name and length are different documents. */ sha256?: string }
export interface DocTextBatch { kind: 'doctext'; key: string; index: number; total: number; chunks: { content: string; position: number }[] }
export interface DocFileChunk { kind: 'docfile'; key: string; meta: DocMeta; index: number; total: number; data: string; checksum?: string }

/** One stable name for a document on both phones. */
export const docKey = (m: { projectId: string; name: string; size: number; sha256?: string }): string => `${m.projectId}|${m.size}|${m.sha256 ?? ''}|${m.name}`;
/** The file's SHA-256 from the phone's native hasher (undefined when it cannot be read; then only name and size identify it). */
const fileSha = async (path: string): Promise<string | undefined> => { try { const h = await RNFS.hash(path, 'sha256'); return DIGEST.test(h) ? h : undefined; } catch { return undefined; } };
const partOf = (key: string) => `${ROOT()}/${sha256(key).slice(0, 24)}.part`;

type Local = { id: number; path: string; meta: DocMeta };
async function localDocs(projectIds: string[]): Promise<Local[]> {
  const out: Local[] = [];
  for (const projectId of projectIds) {
    if (!safeId(projectId)) continue;
    for (const doc of await ragService.getDocumentsByProject(projectId)) {
      if (!safeName(doc.name) || !Number.isSafeInteger(Number(doc.size)) || Number(doc.size) <= 0 || Number(doc.size) > MAX_DOC_BYTES) continue;
      if (!await RNFS.exists(doc.path)) continue;
      const sha = await fileSha(doc.path);
      out.push({ id: doc.id, path: doc.path, meta: { projectId, name: doc.name, size: Number(doc.size), enabled: doc.enabled !== 0, createdAt: doc.created_at, ...(sha ? { sha256: sha } : {}) } });
    }
  }
  return out;
}

/** The documents this phone has, for the other phone to compare. */
export async function docsOnPhone(projectIds: string[]): Promise<string[]> {
  return (await localDocs(projectIds)).map((d) => docKey(d.meta));
}

/** Keys of documents too big to go inside the sync message (the same ones the sender streams). */
export const isLarge = (size: number): boolean => size > INLINE_BYTES;

/** Sends each document the other phone lacks: its text first, then the file. Returns how many documents were sent. */
export interface DocProgress { name: string; doc: number; docs: number; piece: number; pieces: number }
export interface DocSendIo { send: (piece: DocTextBatch | DocFileChunk) => Promise<void>; report?: (p: DocProgress) => void }

export async function sendMissingDocs(projectIds: string[], theirs: string[] | undefined, io: DocSendIo): Promise<number> {
  const { send, report } = io;
  if (!Array.isArray(theirs)) return 0;
  const have = new Set(theirs);
  let sent = 0;
  const missing = (await localDocs(projectIds)).filter((d) => !have.has(docKey(d.meta)));
  for (const doc of missing) {
    const key = docKey(doc.meta);
    const text = (await ragService.getDocumentChunks(doc.id)).map(({ content, position }) => ({ content, position }));
    if (!text.length) continue;
    const batches: DocTextBatch['chunks'][] = [];
    let current: DocTextBatch['chunks'] = []; let chars = 0;
    for (const c of text) {
      if ((chars + c.content.length > TEXT_BATCH_CHARS || current.length >= 4000) && current.length) { batches.push(current); current = []; chars = 0; }
      current.push(c); chars += c.content.length;
    }
    if (current.length) batches.push(current);
    for (let i = 0; i < batches.length; i++) await send({ kind: 'doctext', key, index: i, total: batches.length, chunks: batches[i] });
    const total = Math.ceil(doc.meta.size / DOC_CHUNK_BYTES);
    const digest = sha256.create();
    for (let index = 0; index < total; index++) {
      const data = await RNFS.read(doc.path, DOC_CHUNK_BYTES, index * DOC_CHUNK_BYTES, 'base64');
      digest.update(data);
      await send({ kind: 'docfile', key, meta: doc.meta, index, total, data, ...(index + 1 === total ? { checksum: digest.hex() } : {}) });
      report?.({ name: doc.meta.name, doc: sent + 1, docs: missing.length, piece: index + 1, pieces: total });
    }
    sent++;
  }
  return sent;
}

type Incoming = { next: number; total: number; bytes: number; digest: ReturnType<typeof sha256.create> };
const files = new Map<string, Incoming>();
const texts = new Map<string, { next: number; total: number; chunks: DocTextBatch['chunks'] }>();

const validBatch = (b: DocTextBatch): boolean => !!b && typeof b.key === 'string' && b.key.length < 600 && Number.isInteger(b.index) && Number.isInteger(b.total) && b.index >= 0 && b.total >= 1 && b.index < b.total &&
  b.total <= 2000 && Array.isArray(b.chunks) && b.chunks.length <= 5000 &&
  b.chunks.every((c) => c && typeof c.content === 'string' && c.content.length > 0 && c.content.length <= 500_000 && Number.isSafeInteger(c.position) && c.position >= 0);

/** Keeps a batch of a document's text until its file arrives. */
export function receiveDocText(b: DocTextBatch): void {
  if (!validBatch(b)) throw new Error('Damaged document text.');
  if (b.index === 0) texts.set(b.key, { next: 1, total: b.total, chunks: [...b.chunks] });
  else {
    const t = texts.get(b.key);
    if (!t || t.next !== b.index || t.total !== b.total) { texts.delete(b.key); throw new Error('Document text arrived out of order; retry the transfer.'); }
    t.next++; t.chunks.push(...b.chunks);
  }
  if ((texts.get(b.key)?.chunks.length ?? 0) > MAX_TEXT_CHUNKS) { texts.delete(b.key); throw new Error('Document text is too large.'); }
}

const base64Bytes = (data: string): number => {
  if (!data || data.length % 4 !== 0 || data.length > Math.ceil(DOC_CHUNK_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('Invalid document data.');
  return data.length * 3 / 4 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
};

/** Re-reads the staged file so success means the bytes on disk are the ones that were sent. */
async function verifyFile(path: string, size: number, checksum: string): Promise<void> {
  const digest = sha256.create();
  for (let pos = 0; pos < size; pos += DOC_CHUNK_BYTES) digest.update(await RNFS.read(path, Math.min(DOC_CHUNK_BYTES, size - pos), pos, 'base64'));
  if (digest.hex() !== checksum) throw new Error('Document checksum mismatch on disk.');
}

const metaValid = (meta: DocMeta | undefined): boolean => !!meta && safeId(meta.projectId) && safeName(meta.name) && Number.isSafeInteger(meta.size) && meta.size > 0 &&
  meta.size <= MAX_DOC_BYTES && typeof meta.enabled === 'boolean' && typeof meta.createdAt === 'string' && (meta.sha256 === undefined || DIGEST.test(meta.sha256));

function checkPiece(piece: DocFileChunk): void {
  const { key, meta, index, total, data, checksum } = piece;
  const placeOk = metaValid(meta) && key === docKey(meta) && Number.isInteger(index) && Number.isInteger(total) && index >= 0 && total >= 1 && index < total &&
    total === Math.ceil(meta.size / DOC_CHUNK_BYTES);
  if (!placeOk || typeof data !== 'string' || (checksum !== undefined && (index !== total - 1 || !DIGEST.test(checksum)))) throw new Error('Damaged document piece.');
  const project = useProjectStore.getState().projects.find((p) => p.id === meta.projectId);
  if (!project || project.pinVerifier || project.protectedBlob) throw new Error('That project is not on this phone yet.');
}

/** True when this phone already has the same document: same name and size, and (when the sender sent one) the same bytes. */
async function hasDocument(meta: DocMeta): Promise<boolean> {
  for (const d of await ragService.getDocumentsByProject(meta.projectId)) {
    if (d.name !== meta.name || Number(d.size) !== meta.size) continue;
    if (!meta.sha256) return true;
    const mine = await fileSha(d.path);
    if (!mine || mine === meta.sha256) return true; // unreadable: keep the old behavior, never duplicate
  }
  return false;
}

/** Writes this piece to the .part file. Returns false when the phone already has the document (nothing is staged). */
async function stagePiece(piece: DocFileChunk, part: string): Promise<boolean> {
  const { key, meta, index, total, data } = piece;
  const bytes = base64Bytes(data);
  if (index !== total - 1 && bytes !== DOC_CHUNK_BYTES) throw new Error('Invalid document piece length.');
  const drop = async () => { files.delete(key); await RNFS.unlink(part).catch(() => undefined); };
  if (index === 0) {
    const have = await hasDocument(meta);
    if (have) { files.delete(key); texts.delete(key); return false; }
    files.set(key, { next: 1, total, bytes, digest: sha256.create().update(data) });
    try { await RNFS.writeFile(part, data, 'base64'); } catch (e) { await drop(); throw e; }
    return true;
  }
  const active = files.get(key);
  if (!active) return false; // skipped at piece 0 because this phone already has it
  if (active.next !== index || active.total !== total) { await drop(); throw new Error('Document pieces arrived out of order; retry the transfer.'); }
  active.next++; active.bytes += bytes; active.digest.update(data);
  try { await RNFS.appendFile(part, data, 'base64'); } catch (e) { await drop(); throw e; }
  return true;
}

/** Checks the finished .part file and adds the document, with its text, to the project. */
async function finish(piece: DocFileChunk, part: string): Promise<boolean> {
  const { key, meta, checksum } = piece;
  const active = files.get(key)!;
  files.delete(key);
  const text = texts.get(key); texts.delete(key);
  try {
    if (active.bytes !== meta.size) throw new Error('Document size mismatch.');
    if (!checksum || active.digest.hex() !== checksum) throw new Error('Document checksum mismatch.');
    if (Number((await RNFS.stat(part)).size) !== meta.size) throw new Error('Document was not fully written.');
    await verifyFile(part, meta.size, checksum);
    if (!text || text.next !== text.total || !text.chunks.length) throw new Error('The document text did not arrive; retry the transfer.');
    const dir = `${ROOT()}/${meta.projectId}`;
    await RNFS.mkdir(dir);
    const path = `${dir}/${Date.now().toString(36)}_sync_${meta.name}`;
    await RNFS.moveFile(part, path);
    try { await ragService.appendProjectDocuments([{ ...meta, path, chunks: text.chunks }]); }
    catch (e) { await RNFS.unlink(path).catch(() => undefined); throw e; }
    return true;
  } catch (e) { await RNFS.unlink(part).catch(() => undefined); throw e; }
}

/** Stages one piece of a document file; on the last piece checks it and adds it to the project. True when the document was added. */
export async function receiveDocFile(piece: DocFileChunk): Promise<boolean> {
  checkPiece(piece);
  const part = partOf(piece.key);
  await RNFS.mkdir(ROOT());
  const staged = await stagePiece(piece, part);
  if (!staged || piece.index + 1 < piece.total) return false;
  return finish(piece, part);
}
