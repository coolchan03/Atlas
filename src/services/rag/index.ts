import { contentHash, convertForIndexing } from './convert';
import { structureAwareChunks } from './structure';
import { noteIfStandard, noteTaxSource } from '../../standards/officialDocs';
import { ragDatabase } from './database';
import { MAX_OCR_PAGES, canReadScans, pagedChunksWithScans } from './pageChunks';
import { IndexStopped } from './indexControl';
import { scopeOf } from './scope';
import { chunkDocument } from './chunking';
import { retrievalService } from './retrieval';
import { embeddingService } from './embedding';
import { documentService } from '../documentService';
import logger from '../../utils/logger';
import RNFS from 'react-native-fs';
import { protectedVault, isVaultDocId, newVaultDocId, type VaultDoc } from '../../stores/protectedProjectVault';
import { isProtectedProject } from './knowledgeSource';

/** Files Atlas wrote itself (saved research reports) go when their document is removed;
 *  documents the user imported from elsewhere are left alone. */
export const APP_OWNED_DOC_DIR = 'atlas-research-reports';
/** A protected project keeps only encrypted text: drop the plain copy Atlas made of the file. */
async function removeOwnCopy(path: string | undefined): Promise<void> {
  if (!path) return;
  // Another document (any project) may still use the same file: leave it then.
  try { if (ragDatabase.isPathIndexed(path)) return; } catch { /* index unavailable: be safe below */ }
  const own = [RNFS.DocumentDirectoryPath, RNFS.CachesDirectoryPath].some(root => root && path.startsWith(`${root}/`));
  if (own) await RNFS.unlink(path).catch(() => undefined);
}
async function removeAppOwnedCopy(path: string | undefined): Promise<void> {
  if (!path || !path.startsWith(`${RNFS.DocumentDirectoryPath}/${APP_OWNED_DOC_DIR}/`)) return;
  await RNFS.unlink(path).catch(() => undefined);
}

;
export type { RagDocument, RagSearchResult } from './database';
;
export { chunkDocument } from './chunking';
export { retrievalService } from './retrieval';
;

interface IndexProgress {
  stage: 'extracting' | 'chunking' | 'indexing' | 'embedding' | 'done';
  message: string;
}

interface IndexDocumentParams {
  projectId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  onProgress?: (progress: IndexProgress) => void;
  /** Allow a document with the same name (an update that replaces the old version afterwards). */
  replaceExisting?: boolean;
  /** A safe point (between scanned pages): resolves false when the person pressed stop. */
  gate?: () => Promise<boolean>;
}

/** What to tell the person when pages were read from pictures (a model can misread them) or could not be read. */
function scanNote(paged: { scanned: boolean; ocrPages: number[]; skipped: number } | null): string {
  if (!paged?.scanned) return '';
  const read = paged.ocrPages.length ? `${paged.ocrPages.length} scanned page${paged.ocrPages.length === 1 ? ' was' : 's were'} read from pictures, so check numbers in them. ` : '';
  const left = paged.skipped ? `${paged.skipped} page${paged.skipped === 1 ? '' : 's'} could not be read (more than ${MAX_OCR_PAGES} scanned pages, or no vision model).` : '';
  return `${read}${left}`.trim();
}

/**
 * The text and chunks of a document that has been read. A PDF is chunked page by page so every chunk knows its page, and a scanned PDF (pictures
 * of pages, no text layer) has its pages read from the pictures when a vision model is loaded; without one the person is told what to do.
 * A FASB standard or a tax source is recognised from the first pages and marked, so it overrules textbooks whatever it is called.
 */
async function readAndChunk(args: { fileName: string; filePath: string; attachment: { uri?: string; textContent?: string } | null | undefined; onProgress?: (p: IndexProgress) => void; gate?: () => Promise<boolean> }) {
  const { fileName, filePath, attachment, onProgress, gate } = args;
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const hasText = !!attachment?.textContent;
  if (!hasText && !(isPdf && canReadScans())) {
    throw new Error(isPdf
      ? 'This looks like a scanned PDF with no text layer, so there was no text to extract. Load a model that can see images (a vision model) and add it again: Atlas will read the pages from their pictures.'
      : 'Could not extract text from document');
  }
  const source = { uri: attachment?.uri ?? filePath, textContent: attachment?.textContent ?? '' };
  onProgress?.({ stage: 'chunking', message: 'Splitting into chunks...' });
  // Anything that is not a PDF (or a PDF the phone cannot read by page) is chunked from the whole text.
  const paged = isPdf ? await pagedChunksWithScans(source.uri || filePath, { gate, onOcr: (page, done) => onProgress?.({ stage: 'extracting', message: `Reading scanned page ${page} from its picture (${done} so far)...` }) }) : null;
  // Marked only once the document is really read (a stopped scan leaves no mark behind). A scan is recognised from its first pages.
  const head = paged?.ocrPages.length ? paged.chunks.slice(0, 12).map((c) => c.content).join('\n') : source.textContent;
  noteIfStandard(fileName, head);
  noteTaxSource(fileName, head);
  // Conversion (clean text, web pages and tables as Markdown) then segmentation along the document's own structure; what was changed is said in the note.
  const converted = paged ? null : convertForIndexing(fileName, source.textContent);
  const chunks = paged?.chunks ?? structureAwareChunks(converted!.text) ?? chunkDocument(converted!.text);
  const convNote = converted?.notes.length ? `Converted: ${converted.notes.join('; ')}.` : '';
  return { source, chunks, note: [scanNote(paged), convNote].filter(Boolean).join(' ') || scanNote(paged) };
}

/** Passages embedded, and saved, per step. */
const EMBED_SLICE = 32;

class RagService {
  async ensureReady(): Promise<void> {
    await ragDatabase.ensureReady();
  }

  async indexDocument(params: IndexDocumentParams): Promise<number> {
    this.indexing.set(params.projectId, (this.indexing.get(params.projectId) ?? 0) + 1);
    try { return await this.indexDocumentNow(params); } finally {
      const left = (this.indexing.get(params.projectId) ?? 1) - 1;
      if (left <= 0) this.indexing.delete(params.projectId); else this.indexing.set(params.projectId, left);
    }
  }

  private async indexDocumentNow(params: IndexDocumentParams): Promise<number> {
    const { projectId, filePath, fileName, fileSize, onProgress } = params;
    const isProtected = isProtectedProject(projectId);
    await this.ensureReady();

    // Prevent duplicate indexing of the same file
    const existing = isProtected ? protectedVault.list(projectId) : ragDatabase.getDocumentsByProject(projectId);
    if (isProtected && !protectedVault.isOpen(projectId)) throw new Error('Unlock this project to add documents.');
    if (!params.replaceExisting && existing.some(d => d.path === filePath || d.name === fileName)) {
      throw new Error(`Document "${fileName}" is already in the knowledge base`);
    }

    onProgress?.({ stage: 'extracting', message: `Extracting text from ${fileName}...` });
    // Extract full document text for RAG — don't truncate based on context window
    // A whole textbook is about 1.5 to 3 million characters; the old 500,000 cut most of one off.
    const RAG_MAX_CHARS = 3_000_000;
    const attachment = await documentService.processDocumentFromPath(filePath, fileName, RAG_MAX_CHARS);
    const { source, chunks, note } = await readAndChunk({ fileName, filePath, attachment, onProgress, gate: params.gate }).catch(async (e: unknown) => {
      // Stopped part-way: nothing is added, and the copies made for it are removed (a protected project's plaintext copy included).
      if (e instanceof IndexStopped) {
        if (attachment?.uri && attachment.uri !== filePath) await removeOwnCopy(attachment.uri);
        if (isProtected) await removeOwnCopy(filePath);
      }
      throw e;
    });
    if (chunks.length === 0) {
      throw new Error('Document produced no indexable content');
    }

    if (isProtected) {
      // Protected project: chunks and embeddings go only into the encrypted vault, never rag.db.
      // The extractor's durable copy (source.uri) holds the ORIGINAL plaintext bytes, so it
      // is deleted with the picked file whether or not the vault write succeeds.
      try {
        onProgress?.({ stage: 'embedding', message: 'Generating embeddings...' });
        await embeddingService.load();
        const embeddings = await embeddingService.embedBatch(chunks.map(c => c.content));
        onProgress?.({ stage: 'indexing', message: 'Encrypting...' });
        const id = await protectedVault.addDocument(projectId, {
          name: fileName, path: filePath, size: fileSize,
          chunks: chunks.map((c, i) => ({ content: c.content, position: c.position, embedding: embeddings[i] })),
        });
        onProgress?.({ stage: 'done', message: note ? `Done. ${note}` : 'Done' });
        return id;
      } finally {
        await removeOwnCopy(filePath);
        if (source.uri && source.uri !== filePath) await removeOwnCopy(source.uri);
      }
    }

    // The same content under another name is not indexed twice (no second copy, no second set of embeddings).
    const hash = contentHash(chunks.map((c) => c.content).join('\n'));
    const twin = ragDatabase.findNameByHash(projectId, hash);
    if (twin && !params.replaceExisting) {
      if (source.uri && source.uri !== filePath) await removeOwnCopy(source.uri);
      throw new Error(`Document "${fileName}" has the same content as "${twin}", which is already in the knowledge base`);
    }
    onProgress?.({ stage: 'indexing', message: 'Indexing chunks...' });
    // The extractor saves a durable local copy. Index that path rather than a
    // picker/cache path that can disappear before the next backup.
    const docId = ragDatabase.insertDocument({ projectId, name: fileName, path: source.uri || filePath, size: fileSize, contentHash: hash });
    const rowIds = ragDatabase.insertChunks(docId, chunks);

    onProgress?.({ stage: 'embedding', message: 'Generating embeddings...' });
    try {
      await embeddingService.load();
      const done = await this.embedInSlices(docId, chunks.map((c, i) => ({ id: rowIds[i], content: c.content })), onProgress);
      logger.log(`[RAG] Generated ${done} embeddings for ${fileName}`);
    } catch (err) {
      // A document with zero embeddings is invisible to semantic search and never
      // auto-backfilled — a permanent dead entry. Roll back the just-inserted doc + chunks
      // and surface the failure so the KB screen reports it, rather than swallowing it.
      logger.error('[RAG] Embedding generation failed — rolling back index:', err);
      ragDatabase.deleteDocument(docId);
      throw err instanceof Error ? err : new Error('Embedding generation failed');
    }

    onProgress?.({ stage: 'done', message: note ? `Done. ${note}` : 'Done' });
    logger.log(`[RAG] Indexed ${fileName}: ${chunks.length} chunks`);
    return docId;
  }

  /**
   * Embeds passages a slice at a time and saves each slice as soon as it is made, so an indexing that is cut off (the app closed, the phone out of
   * memory) keeps what it finished and the next run does only the rest. One embedding runs at a time: the engine is not safe to call twice at once.
   */
  private embedChain: Promise<unknown> = Promise.resolve();
  /** Projects with an indexDocument running: their half-indexed passages are not "interrupted work" and are left to it. */
  private indexing = new Map<string, number>();

  /** Embedding runs one batch at a time across the whole app (indexing, finishing an interrupted library): the engine must not be called twice at once. */
  private embedInSlices(docId: number, chunks: { id: number; content: string }[], onProgress?: (p: IndexProgress) => void): Promise<number> {
    const run = this.embedChain.then(() => this.embedSlices(docId, chunks, onProgress));
    this.embedChain = run.catch(() => undefined);
    return run;
  }

  private async embedSlices(docId: number, chunks: { id: number; content: string }[], onProgress?: (p: IndexProgress) => void): Promise<number> {
    let done = 0;
    for (let at = 0; at < chunks.length; at += EMBED_SLICE) {
      const slice = chunks.slice(at, at + EMBED_SLICE);
      const embeddings = await embeddingService.embedBatch(slice.map((c) => c.content));
      ragDatabase.insertEmbeddingsBatch(slice.map((c, i) => ({ chunkRowid: c.id, docId, embedding: embeddings[i] })));
      done += slice.length;
      if (chunks.length > EMBED_SLICE) onProgress?.({ stage: 'embedding', message: `Embedding passages: ${done} of ${chunks.length}` });
    }
    return done;
  }

  private resuming = new Set<string>();

  /**
   * Finishes the embedding of passages whose indexing was cut off, without waiting for the person to ask. One run per project at a time, and never
   * while a chat reply is being written (the reply goes first; it is tried again the next time the library is opened). Returns how many passages it embedded.
   */
  async resumeIndexing(projectId: string): Promise<number> {
    if (this.resuming.has(projectId) || (this.indexing.get(projectId) ?? 0) > 0) return 0;
    try { if (require('../llm').llmService.isCurrentlyGenerating()) return 0; } catch { /* no engine to ask: carry on */ }
    this.resuming.add(projectId);
    try { return await this.backfillEmbeddings(projectId); } finally { this.resuming.delete(projectId); }
  }

  async backfillEmbeddings(projectId: string): Promise<number> {
    await this.ensureReady();
    const docs = ragDatabase.getDocumentsByProject(projectId);
    let total = 0;

    for (const doc of docs) {
      // Only the passages still without an embedding: a document whose indexing was cut off carries on where it stopped.
      const missing = ragDatabase.getUnembeddedChunks(doc.id);
      if (missing.length === 0) continue;

      try {
        await embeddingService.load();
        const count = await this.embedInSlices(doc.id, missing);
        total += count;
        logger.log(`[RAG] Backfilled ${count} embeddings for ${doc.name}`);
      } catch (err) {
        logger.error(`[RAG] Backfill failed for ${doc.name}:`, err);
      }
    }

    return total;
  }

  /** Full text of one project document, in order (works for protected and ordinary projects). */
  async readDocumentText(projectId: string, docId: number): Promise<string> {
    if (isVaultDocId(docId)) {
      const note = protectedVault.noteText(docId);
      if (note !== undefined) return note;
      return protectedVault.getEmbeddingsByProject(projectId).filter(r => r.doc_id === docId)
        .sort((a, b) => a.position - b.position).map(r => r.content).join('\n');
    }
    await this.ensureReady();
    // A plain-text document (e.g. a note written in Atlas) keeps its exact text in the app's own copy.
    const doc = ragDatabase.getDocumentById(docId);
    if (doc?.path?.startsWith(`${RNFS.DocumentDirectoryPath}/`) && /\.(md|txt)$/i.test(doc.path)) {
      const text = await RNFS.readFile(doc.path, 'utf8').catch(() => null);
      if (text !== null) return text;
    }
    return ragDatabase.getChunksByDocument(docId).map(c => c.content).join('\n');
  }

  /**
   * Creates or updates a named text document in the project's knowledge base, shared by every
   * chat in the project (e.g. "Current Progress"). `append` adds to the end of the current text.
   * A protected project's note goes straight into its encrypted vault: no plain file is written.
   */
  async saveProjectNote(params: { projectId: string; name: string; text: string; mode?: 'replace' | 'append'; replacesDocId?: number }): Promise<number> {
    const { projectId, mode = 'replace' } = params;
    const name = params.name.trim().replace(/[\\/]/g, '_').slice(0, 80);
    if (!name) throw new Error('The document needs a name.');
    if (!params.text.trim()) throw new Error('The document text is empty.');
    const existing = (await this.getDocumentsByProject(projectId))
      .find(d => d.name.toLowerCase() === name.toLowerCase() || d.name.toLowerCase() === `${name.toLowerCase()}.md`);
    const before = existing && mode === 'append' ? await this.readDocumentText(projectId, existing.id) : '';
    const text = before ? `${before.trimEnd()}\n\n${params.text.trim()}` : params.text.trim();
    let id: number;
    if (isProtectedProject(projectId)) {
      if (!protectedVault.isOpen(projectId)) throw new Error('Unlock this project to change its documents.');
      const chunks = chunkDocument(text);
      if (!chunks.length) throw new Error('Document produced no indexable content');
      await embeddingService.load();
      const embeddings = await embeddingService.embedBatch(chunks.map(c => c.content));
      id = await protectedVault.addDocument(projectId, {
        name, path: `atlas-note:${name}`, size: text.length, text,
        chunks: chunks.map((c, i) => ({ content: c.content, position: c.position, embedding: embeddings[i] })),
      });
    } else {
      // Indexing keeps its own durable copy; the temporary file is removed afterwards.
      const tmp = `${RNFS.CachesDirectoryPath}/atlas-note-${Date.now()}.md`;
      await RNFS.writeFile(tmp, text, 'utf8');
      try {
        id = await this.indexDocument({ projectId, filePath: tmp, fileName: name.endsWith('.md') ? name : `${name}.md`, fileSize: text.length, replaceExisting: true });
      } finally { await RNFS.unlink(tmp).catch(() => undefined); }
    }
    // Remove the previous version only once the new one is stored (also the old name after a rename).
    if (existing) await this.deleteDocument(existing.id);
    if (params.replacesDocId !== undefined && params.replacesDocId !== existing?.id && params.replacesDocId !== id) {
      await this.deleteDocument(params.replacesDocId);
    }
    return id;
  }

  async deleteDocument(docId: number): Promise<void> {
    if (isVaultDocId(docId)) {
      const gone = await protectedVault.remove(docId);
      await removeAppOwnedCopy(gone?.path);
      return;
    }
    await this.ensureReady();
    const doc = ragDatabase.getDocumentById(docId);
    ragDatabase.deleteDocument(docId);
    if (doc) await removeAppOwnedCopy(doc.path);
  }

  /** Protected projects list their documents only while unlocked. */
  async getDocumentsByProject(projectId: string) {
    if (isProtectedProject(projectId)) return protectedVault.list(projectId);
    await this.ensureReady();
    return ragDatabase.getDocumentsByProject(projectId);
  }

  /**
   * The documents a project can use: its own and those of the folders around it. For writing lessons, questions and checks; the list of what
   * is in the project itself stays getDocumentsByProject. Each carries `fromFolder` when it belongs to a folder around the project.
   */
  async getDocumentsInScope(projectId: string) {
    type Doc = Awaited<ReturnType<RagService['getDocumentsByProject']>>[number] & { fromFolder?: string };
    const out: Doc[] = [];
    for (const id of scopeOf(projectId)) {
      for (const d of await this.getDocumentsByProject(id)) out.push(id === projectId ? d : { ...d, fromFolder: id });
    }
    return out;
  }

  /** How big a project's library is on this phone: passages per document and the space they and their search data take. Null for a protected project. */
  async libraryStats(projectId: string) {
    await this.ensureReady();
    return isProtectedProject(projectId) ? null : ragDatabase.getLibraryStats(projectId);
  }

  async getDocumentChunks(docId: number): Promise<{ content: string; position: number }[]> {
    await this.ensureReady();
    return ragDatabase.getChunksByDocument(docId);
  }

  async restoreProjectDocuments(projectIds: string[], files: {
    projectId: string; name: string; path: string; size: number; enabled: boolean;
    createdAt: string; chunks: { content: string; position: number }[];
  }[]): Promise<void> {
    await this.ensureReady();
    ragDatabase.restoreProjectDocuments(projectIds, files);
  }

  async appendProjectDocuments(files: {
    projectId: string; name: string; path: string; size: number; enabled: boolean;
    createdAt: string; chunks: { content: string; position: number }[];
  }[]): Promise<void> {
    await this.ensureReady();
    ragDatabase.appendProjectDocuments(files);
  }

  async toggleDocument(docId: number, enabled: boolean): Promise<void> {
    if (isVaultDocId(docId)) { await protectedVault.setEnabled(docId, enabled); return; }
    await this.ensureReady();
    ragDatabase.toggleEnabled(docId, enabled);
  }

  /** `options` is a context length in characters (an old way of calling it), or { contextLength, topK } to fetch more passages than the default five. */
  async searchProject(projectId: string, query: string, options?: number | { contextLength?: number; topK?: number; include?: (docName: string) => boolean }) {
    await this.ensureReady();
    const { contextLength, topK, include } = typeof options === 'number' ? { contextLength: options, topK: undefined, include: undefined } : (options ?? {});
    if (contextLength) {
      return retrievalService.searchWithBudget({ projectId, query, contextLength, topK });
    }
    return retrievalService.search(projectId, query, { topK, include });
  }

  async deleteProjectDocuments(projectId: string): Promise<void> {
    await this.ensureReady();
    if (isProtectedProject(projectId)) {
      const useProjectStore = require('../../stores/storeRefs').projectStoreRef();
      const { unlockedProjectPin } = require('../../stores/protectionState');
      const verifier: string | undefined = useProjectStore.getState().getProject(projectId)?.pinVerifier;
      for (const doc of protectedVault.list(projectId)) await removeAppOwnedCopy(doc.path);
      await protectedVault.destroy(projectId, unlockedProjectPin(projectId), verifier);
    }
    const docs = ragDatabase.getDocumentsByProject(projectId);
    ragDatabase.deleteDocumentsByProject(projectId);
    for (const doc of docs) await removeAppOwnedCopy(doc.path);
  }

  /** Moves a project's rag.db documents into encrypted form (protecting a project that has some). */
  async exportProjectDocuments(projectId: string): Promise<VaultDoc[]> {
    await this.ensureReady();
    return ragDatabase.getDocumentsByProject(projectId).map(d => {
      const chunks = ragDatabase.getChunksByDocument(d.id);
      const vectors = new Map(ragDatabase.getEmbeddingsByDocument(d.id).map(e => [e.chunk_rowid, e.embedding]));
      return {
        id: newVaultDocId(), name: d.name, path: d.path, size: d.size, createdAt: d.created_at, enabled: d.enabled,
        chunks: chunks.map(c => ({ content: c.content, position: c.position, embedding: vectors.get(c.id) ?? [] })),
      };
    });
  }

  /** Erases a project's plain rag.db copies once the encrypted copy is safely written. */
  async eraseProjectDocumentsFromIndex(projectId: string): Promise<void> {
    await this.ensureReady();
    const docs = ragDatabase.getDocumentsByProject(projectId);
    ragDatabase.deleteDocumentsByProject(projectId);
    for (const doc of docs) await removeOwnCopy(doc.path);
  }

  /** The reverse: puts decrypted documents back into rag.db (removing protection). */
  async importProjectDocuments(projectId: string, docs: VaultDoc[]): Promise<void> {
    await this.ensureReady();
    ragDatabase.deleteDocumentsByProject(projectId);
    for (const d of docs) {
      const id = ragDatabase.insertDocument({ projectId, name: d.name, path: d.path, size: d.size });
      const rows = ragDatabase.insertChunks(id, d.chunks.map(c => ({ content: c.content, position: c.position })) as any);
      const withVectors = rows.flatMap((rowId, i) => (d.chunks[i].embedding.length ? [{ chunkRowid: rowId, docId: id, embedding: d.chunks[i].embedding }] : []));
      if (withVectors.length) ragDatabase.insertEmbeddingsBatch(withVectors);
      if (!d.enabled) ragDatabase.toggleEnabled(id, false);
    }
  }
}

export const ragService = new RagService();
