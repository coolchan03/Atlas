import { open } from '@op-engineering/op-sqlite';
import type { DB } from '@op-engineering/op-sqlite';
import { ftsMatchQuery } from './ftsQuery';
import type { Chunk } from './chunking';
import logger from '../../utils/logger';

export interface RagDocument {
  id: number;
  project_id: string;
  name: string;
  path: string;
  size: number;
  created_at: string;
  enabled: number;
}

export interface RagSearchResult {
  doc_id: number;
  name: string;
  content: string;
  position: number;
  score: number;
}

export interface StoredEmbedding {
  chunk_rowid: number;
  doc_id: number;
  name: string;
  content: string;
  position: number;
  embedding: number[];
}

/** Goes up when the full-text index has to be filled again for passages already stored. */
const FTS_VERSION = 1;

class RagDatabase {
  private db: DB | null = null;
  private ready = false;

  /** Goes up whenever the stored text or embeddings change, so a cache of them knows when it is out of date. */
  version = 0;
  private bump(): void { this.version += 1; }

  async ensureReady(): Promise<void> {
    if (this.ready) return;
    try {
      this.db = open({ name: 'rag.db' });
      // Deleted rows (a project that was just protected) must be overwritten, not left in free pages.
      try { this.db.executeSync('PRAGMA secure_delete = ON'); } catch { /* older SQLite */ }
      this.db.executeSync(
        `CREATE TABLE IF NOT EXISTS rag_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          size INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1
        )`
      );
      this.db.executeSync(
        `CREATE TABLE IF NOT EXISTS rag_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          doc_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY (doc_id) REFERENCES rag_documents(id)
        )`
      );
      this.db.executeSync(
        `CREATE TABLE IF NOT EXISTS rag_embeddings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chunk_rowid INTEGER NOT NULL,
          doc_id INTEGER NOT NULL,
          embedding BLOB NOT NULL,
          FOREIGN KEY (chunk_rowid) REFERENCES rag_chunks(id),
          FOREIGN KEY (doc_id) REFERENCES rag_documents(id)
        )`
      );
      this.setupFts();
      this.ready = true;
    } catch (error) {
      logger.error('[RagDB] Failed to initialize:', error);
      throw error;
    }
  }

  private getDb(): DB {
    if (!this.db) throw new Error('RagDatabase not initialized. Call ensureReady() first.');
    return this.db;
  }

  insertDocument(doc: { projectId: string; name: string; path: string; size: number }): number {
    this.bump();
    const db = this.getDb();
    const result = db.executeSync(
      'INSERT INTO rag_documents (project_id, name, path, size, created_at) VALUES (?, ?, ?, ?, ?)',
      [doc.projectId, doc.name, doc.path, doc.size, new Date().toISOString()]
    );
    if (result.insertId == null) throw new Error('Failed to insert document: no insertId returned');
    return result.insertId;
  }

  insertChunks(docId: number, chunks: Chunk[]): number[] {
    this.bump();
    const db = this.getDb();
    const rowIds: number[] = [];
    db.executeSync('BEGIN');
    try {
      for (const chunk of chunks) {
        const result = db.executeSync(
          'INSERT INTO rag_chunks (content, doc_id, position) VALUES (?, ?, ?)',
          [chunk.content, docId, chunk.position]
        );
        if (result.insertId == null) throw new Error(`Failed to insert chunk at position ${chunk.position}`);
        rowIds.push(result.insertId);
      }
      db.executeSync('COMMIT');
    } catch (e) {
      db.executeSync('ROLLBACK');
      throw e;
    }
    return rowIds;
  }

  private embeddingToBlob(embedding: number[]): ArrayBuffer {
    return new Float32Array(embedding).buffer;
  }

  private blobToEmbedding(blob: any): number[] {
    if (blob instanceof ArrayBuffer) return Array.from(new Float32Array(blob));
    if (blob?.buffer instanceof ArrayBuffer) return Array.from(new Float32Array(blob.buffer));
    return [];
  }

  insertEmbeddingsBatch(entries: { chunkRowid: number; docId: number; embedding: number[] }[]): void {
    this.bump();
    const db = this.getDb();
    db.executeSync('BEGIN');
    try {
      for (const entry of entries) {
        db.executeSync(
          'INSERT INTO rag_embeddings (chunk_rowid, doc_id, embedding) VALUES (?, ?, ?)',
          [entry.chunkRowid, entry.docId, this.embeddingToBlob(entry.embedding)]
        );
      }
      db.executeSync('COMMIT');
    } catch (e) {
      db.executeSync('ROLLBACK');
      throw e;
    }
  }

  getEmbeddingsByProject(projectId: string): StoredEmbedding[] {
    const db = this.getDb();
    const result = db.executeSync(
      `SELECT e.chunk_rowid, e.doc_id, d.name, c.content, c.position, e.embedding
       FROM rag_embeddings e
       JOIN rag_chunks c ON e.chunk_rowid = c.id
       JOIN rag_documents d ON e.doc_id = d.id
       WHERE d.project_id = ? AND d.enabled = 1`,
      [projectId]
    );
    return ((result.rows ?? []) as unknown as any[]).map(row => ({
      ...row,
      embedding: this.blobToEmbedding(row.embedding),
    }));
  }

  /** Embeddings of one document, keyed by the chunk row they belong to. */
  getEmbeddingsByDocument(docId: number): { chunk_rowid: number; embedding: number[] }[] {
    const db = this.getDb();
    const result = db.executeSync('SELECT chunk_rowid, embedding FROM rag_embeddings WHERE doc_id = ?', [docId]);
    return ((result.rows ?? []) as unknown as any[]).map(row => ({
      chunk_rowid: row.chunk_rowid,
      embedding: this.blobToEmbedding(row.embedding),
    }));
  }

  /** True when any indexed document uses this file path. */
  isPathIndexed(path: string): boolean {
    const result = this.getDb().executeSync('SELECT COUNT(*) as count FROM rag_documents WHERE path = ?', [path]);
    const rows = (result.rows ?? []) as unknown as { count: number }[];
    return rows.length > 0 && rows[0].count > 0;
  }

  hasEmbeddingsForDocument(docId: number): boolean {
    const db = this.getDb();
    const result = db.executeSync(
      'SELECT COUNT(*) as count FROM rag_embeddings WHERE doc_id = ?',
      [docId]
    );
    const rows = (result.rows ?? []) as unknown as { count: number }[];
    return rows.length > 0 && rows[0].count > 0;
  }

  getChunksByDocument(docId: number): { id: number; content: string; position: number }[] {
    const db = this.getDb();
    const result = db.executeSync(
      'SELECT id, content, position FROM rag_chunks WHERE doc_id = ? ORDER BY position',
      [docId]
    );
    return (result.rows ?? []) as unknown as { id: number; content: string; position: number }[];
  }

  deleteDocument(docId: number): void {
    this.bump();
    const db = this.getDb();
    db.executeSync('DELETE FROM rag_embeddings WHERE doc_id = ?', [docId]);
    db.executeSync('DELETE FROM rag_chunks WHERE doc_id = ?', [docId]);
    db.executeSync('DELETE FROM rag_documents WHERE id = ?', [docId]);
  }

  getDocumentById(docId: number): RagDocument | null {
    const db = this.getDb();
    const result = db.executeSync(
      'SELECT id, project_id, name, path, size, created_at, enabled FROM rag_documents WHERE id = ?',
      [docId]
    );
    return ((result.rows ?? [])[0] as unknown as RagDocument) ?? null;
  }

  getDocumentsByProject(projectId: string): RagDocument[] {
    const db = this.getDb();
    const result = db.executeSync(
      'SELECT id, project_id, name, path, size, created_at, enabled FROM rag_documents WHERE project_id = ? ORDER BY created_at DESC',
      [projectId]
    );
    return (result.rows ?? []) as unknown as RagDocument[];
  }

  toggleEnabled(docId: number, enabled: boolean): void {
    this.bump();
    const db = this.getDb();
    db.executeSync('UPDATE rag_documents SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, docId]);
  }

  /** True when passages are also kept in a full-text index (SQLite FTS5), so a keyword search reads the matches, not every passage. */
  private ftsReady = false;
  get hasFullText(): boolean { return this.ftsReady; }

  /**
   * The full-text index follows rag_chunks by itself (triggers on insert, update and delete, so every way passages are written, restored or
   * synced stays in step), and is filled once for passages that were stored before it existed. A build of SQLite without FTS5 leaves
   * it off: nothing else changes, keyword search then reads the passages as before.
   */
  private setupFts(): void {
    const db = this.getDb();
    try {
      db.executeSync(`CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(content, content='rag_chunks', content_rowid='id', tokenize='porter unicode61')`);
      db.executeSync(`CREATE TRIGGER IF NOT EXISTS rag_fts_ai AFTER INSERT ON rag_chunks BEGIN INSERT INTO rag_fts(rowid, content) VALUES (new.id, new.content); END`);
      db.executeSync(`CREATE TRIGGER IF NOT EXISTS rag_fts_ad AFTER DELETE ON rag_chunks BEGIN INSERT INTO rag_fts(rag_fts, rowid, content) VALUES ('delete', old.id, old.content); END`);
      db.executeSync(`CREATE TRIGGER IF NOT EXISTS rag_fts_au AFTER UPDATE ON rag_chunks BEGIN INSERT INTO rag_fts(rag_fts, rowid, content) VALUES ('delete', old.id, old.content); INSERT INTO rag_fts(rowid, content) VALUES (new.id, new.content); END`);
      const version = Number((db.executeSync('PRAGMA user_version').rows?.[0] as { user_version?: number } | undefined)?.user_version ?? 0);
      if (version < FTS_VERSION) {
        db.executeSync(`INSERT INTO rag_fts(rag_fts) VALUES ('rebuild')`);
        db.executeSync(`PRAGMA user_version = ${FTS_VERSION}`);
      }
      this.ftsReady = true;
    } catch (error) {
      this.ftsReady = false;
      logger.warn('[RagDB] full-text search is not available in this build of SQLite; keyword search reads the passages instead:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Passages of a project that match the question's words, best first, read from the full-text index. null when there is no index (the caller
   * reads the passages instead); an empty list means the index was asked and nothing matches. Disabled documents are left out.
   */
  searchKeywords(projectId: string, query: string, limit: number): RagSearchResult[] | null {
    if (!this.ftsReady) return null;
    const match = ftsMatchQuery(query);
    if (!match) return [];
    try {
      const result = this.getDb().executeSync(
        `SELECT c.doc_id AS doc_id, d.name AS name, c.content AS content, c.position AS position, -bm25(rag_fts) AS score
         FROM rag_fts JOIN rag_chunks c ON c.id = rag_fts.rowid JOIN rag_documents d ON c.doc_id = d.id
         WHERE rag_fts MATCH ? AND d.project_id = ? AND d.enabled = 1
         ORDER BY bm25(rag_fts) LIMIT ?`,
        [match, projectId, limit],
      );
      return (result.rows ?? []) as unknown as RagSearchResult[];
    } catch (error) {
      logger.warn('[RagDB] full-text search failed, reading the passages instead:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /** Chunks of a project's documents that contain any of the strings, most useful first (a chunk that opens with it before one that only mentions it is decided by the caller). */
  findChunksContaining(projectId: string, needles: string[], limit: number): RagSearchResult[] {
    if (!needles.length) return [];
    const db = this.getDb();
    const like = needles.map(() => "c.content LIKE ? ESCAPE '\\'").join(' OR ');
    const args = needles.map((n) => `%${n.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    const result = db.executeSync(
      `SELECT c.doc_id, d.name, c.content, c.position, 0 as score
       FROM rag_chunks c JOIN rag_documents d ON c.doc_id = d.id
       WHERE d.project_id = ? AND d.enabled = 1 AND (${like}) LIMIT ?`,
      [projectId, ...args, limit],
    );
    return (result.rows ?? []) as unknown as RagSearchResult[];
  }

  /** Per document: how many passages and characters it has, and the bytes the project's embeddings take. For the library size card. */
  getLibraryStats(projectId: string): { documents: Array<{ id: number; chunks: number; chars: number }>; embeddingBytes: number } {
    const db = this.getDb();
    const docs = db.executeSync(
      `SELECT d.id AS id, COUNT(c.id) AS chunks, COALESCE(SUM(LENGTH(c.content)), 0) AS chars
       FROM rag_documents d LEFT JOIN rag_chunks c ON c.doc_id = d.id WHERE d.project_id = ? GROUP BY d.id`, [projectId]);
    const emb = db.executeSync(
      `SELECT COALESCE(SUM(LENGTH(e.embedding)), 0) AS bytes FROM rag_embeddings e JOIN rag_documents d ON e.doc_id = d.id WHERE d.project_id = ?`, [projectId]);
    return {
      documents: ((docs.rows ?? []) as unknown as Array<{ id: number; chunks: number; chars: number }>).map((r) => ({ id: Number(r.id), chunks: Number(r.chunks), chars: Number(r.chars) })),
      embeddingBytes: Number(((emb.rows ?? []) as unknown as Array<{ bytes: number }>)[0]?.bytes ?? 0),
    };
  }

  getChunksByProject(projectId: string, topK: number = 5): RagSearchResult[] {
    const db = this.getDb();
    const result = db.executeSync(
      `SELECT c.doc_id, d.name, c.content, c.position, 0 as score
       FROM rag_chunks c JOIN rag_documents d ON c.doc_id = d.id
       WHERE d.project_id = ? AND d.enabled = 1
       ORDER BY c.position LIMIT ?`,
      [projectId, topK]
    );
    return (result.rows ?? []) as unknown as RagSearchResult[];
  }

  /** Replace backed-up project documents in a single SQLite transaction. */
  restoreProjectDocuments(projectIds: string[], docs: {
    projectId: string; name: string; path: string; size: number;
    enabled: boolean; createdAt: string; chunks: { content: string; position: number }[];
  }[]): void {
    this.bump();
    const db = this.getDb();
    db.executeSync('BEGIN');
    try {
      for (const projectId of projectIds) {
        db.executeSync('DELETE FROM rag_embeddings WHERE doc_id IN (SELECT id FROM rag_documents WHERE project_id = ?)', [projectId]);
        db.executeSync('DELETE FROM rag_chunks WHERE doc_id IN (SELECT id FROM rag_documents WHERE project_id = ?)', [projectId]);
        db.executeSync('DELETE FROM rag_documents WHERE project_id = ?', [projectId]);
      }
      for (const doc of docs) {
        const result = db.executeSync(
          'INSERT INTO rag_documents (project_id, name, path, size, created_at, enabled) VALUES (?, ?, ?, ?, ?, ?)',
          [doc.projectId, doc.name, doc.path, doc.size, doc.createdAt, doc.enabled ? 1 : 0],
        );
        if (result.insertId == null) throw new Error('Could not restore project document.');
        for (const chunk of doc.chunks) {
          db.executeSync('INSERT INTO rag_chunks (content, doc_id, position) VALUES (?, ?, ?)',
            [chunk.content, result.insertId, chunk.position]);
        }
      }
      db.executeSync('COMMIT');
    } catch (error) {
      db.executeSync('ROLLBACK');
      throw error;
    }
  }

  /** Sync adds only new documents. Never clear another device's project data. */
  appendProjectDocuments(docs: {
    projectId: string; name: string; path: string; size: number;
    enabled: boolean; createdAt: string; chunks: { content: string; position: number }[];
  }[]): void {
    this.bump();
    const db = this.getDb();
    db.executeSync('BEGIN');
    try {
      for (const doc of docs) {
        const result = db.executeSync(
          'INSERT INTO rag_documents (project_id, name, path, size, created_at, enabled) VALUES (?, ?, ?, ?, ?, ?)',
          [doc.projectId, doc.name, doc.path, doc.size, doc.createdAt, doc.enabled ? 1 : 0],
        );
        if (result.insertId == null) throw new Error('Could not sync project document.');
        for (const chunk of doc.chunks) {
          db.executeSync('INSERT INTO rag_chunks (content, doc_id, position) VALUES (?, ?, ?)',
            [chunk.content, result.insertId, chunk.position]);
        }
      }
      db.executeSync('COMMIT');
    } catch (error) {
      db.executeSync('ROLLBACK');
      throw error;
    }
  }

  deleteDocumentsByProject(projectId: string): void {
    this.bump();
    const db = this.getDb();
    db.executeSync('DELETE FROM rag_embeddings WHERE doc_id IN (SELECT id FROM rag_documents WHERE project_id = ?)', [projectId]);
    db.executeSync('DELETE FROM rag_chunks WHERE doc_id IN (SELECT id FROM rag_documents WHERE project_id = ?)', [projectId]);
    db.executeSync('DELETE FROM rag_documents WHERE project_id = ?', [projectId]);
  }
}

export const ragDatabase = new RagDatabase();
