import { ragDatabase } from './database';
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
}

class RagService {
  async ensureReady(): Promise<void> {
    await ragDatabase.ensureReady();
  }

  async indexDocument(params: IndexDocumentParams): Promise<number> {
    const { projectId, filePath, fileName, fileSize, onProgress } = params;
    const isProtected = isProtectedProject(projectId);
    await this.ensureReady();

    // Prevent duplicate indexing of the same file
    const existing = isProtected ? protectedVault.list(projectId) : ragDatabase.getDocumentsByProject(projectId);
    if (isProtected && !protectedVault.isOpen(projectId)) throw new Error('Unlock this project to add documents.');
    if (existing.some(d => d.path === filePath || d.name === fileName)) {
      throw new Error(`Document "${fileName}" is already in the knowledge base`);
    }

    onProgress?.({ stage: 'extracting', message: `Extracting text from ${fileName}...` });
    // Extract full document text for RAG — don't truncate based on context window
    const RAG_MAX_CHARS = 500_000;
    const attachment = await documentService.processDocumentFromPath(filePath, fileName, RAG_MAX_CHARS);
    if (!attachment?.textContent) {
      // A PDF that extracts to zero text is a scanned / image-only PDF (no text layer);
      // there is no on-device OCR, so name that cause instead of a generic failure (B-KB).
      const isPdf = fileName.toLowerCase().endsWith('.pdf');
      throw new Error(
        isPdf
          ? 'This looks like a scanned PDF with no text layer, so there was no text to extract (OCR is not available).'
          : 'Could not extract text from document',
      );
    }

    onProgress?.({ stage: 'chunking', message: 'Splitting into chunks...' });
    const chunks = chunkDocument(attachment.textContent);
    if (chunks.length === 0) {
      throw new Error('Document produced no indexable content');
    }

    if (isProtected) {
      // Protected project: chunks and embeddings go only into the encrypted vault, never rag.db.
      onProgress?.({ stage: 'embedding', message: 'Generating embeddings...' });
      await embeddingService.load();
      const embeddings = await embeddingService.embedBatch(chunks.map(c => c.content));
      onProgress?.({ stage: 'indexing', message: 'Encrypting...' });
      const id = await protectedVault.addDocument(projectId, {
        name: fileName, path: filePath, size: fileSize,
        chunks: chunks.map((c, i) => ({ content: c.content, position: c.position, embedding: embeddings[i] })),
      });
      await removeOwnCopy(filePath);
      onProgress?.({ stage: 'done', message: 'Done' });
      return id;
    }

    onProgress?.({ stage: 'indexing', message: 'Indexing chunks...' });
    // The extractor saves a durable local copy. Index that path rather than a
    // picker/cache path that can disappear before the next backup.
    const docId = ragDatabase.insertDocument({ projectId, name: fileName, path: attachment.uri || filePath, size: fileSize });
    const rowIds = ragDatabase.insertChunks(docId, chunks);

    onProgress?.({ stage: 'embedding', message: 'Generating embeddings...' });
    try {
      await embeddingService.load();
      const texts = chunks.map(c => c.content);
      const embeddings = await embeddingService.embedBatch(texts);
      const entries = rowIds.map((rowId, i) => ({
        chunkRowid: rowId,
        docId,
        embedding: embeddings[i],
      }));
      ragDatabase.insertEmbeddingsBatch(entries);
      logger.log(`[RAG] Generated ${embeddings.length} embeddings for ${fileName}`);
    } catch (err) {
      // A document with zero embeddings is invisible to semantic search and never
      // auto-backfilled — a permanent dead entry. Roll back the just-inserted doc + chunks
      // and surface the failure so the KB screen reports it, rather than swallowing it.
      logger.error('[RAG] Embedding generation failed — rolling back index:', err);
      ragDatabase.deleteDocument(docId);
      throw err instanceof Error ? err : new Error('Embedding generation failed');
    }

    onProgress?.({ stage: 'done', message: 'Done' });
    logger.log(`[RAG] Indexed ${fileName}: ${chunks.length} chunks`);
    return docId;
  }

  async backfillEmbeddings(projectId: string): Promise<number> {
    await this.ensureReady();
    const docs = ragDatabase.getDocumentsByProject(projectId);
    let total = 0;

    for (const doc of docs) {
      if (ragDatabase.hasEmbeddingsForDocument(doc.id)) continue;

      const chunks = ragDatabase.getChunksByDocument(doc.id);
      if (chunks.length === 0) continue;

      try {
        await embeddingService.load();
        const texts = chunks.map(c => c.content);
        const embeddings = await embeddingService.embedBatch(texts);
        const entries = chunks.map((chunk, i) => ({
          chunkRowid: chunk.id,
          docId: doc.id,
          embedding: embeddings[i],
        }));
        ragDatabase.insertEmbeddingsBatch(entries);
        total += embeddings.length;
        logger.log(`[RAG] Backfilled ${embeddings.length} embeddings for ${doc.name}`);
      } catch (err) {
        logger.error(`[RAG] Backfill failed for ${doc.name}:`, err);
      }
    }

    return total;
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

  async searchProject(projectId: string, query: string, contextLength?: number) {
    await this.ensureReady();
    if (contextLength) {
      return retrievalService.searchWithBudget({ projectId, query, contextLength });
    }
    return retrievalService.search(projectId, query);
  }

  async deleteProjectDocuments(projectId: string): Promise<void> {
    await this.ensureReady();
    if (isProtectedProject(projectId)) {
      const { useProjectStore } = require('../../stores/projectStore');
      const { unlockedProjectPin } = require('../../stores/protectedProjectStorage');
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
