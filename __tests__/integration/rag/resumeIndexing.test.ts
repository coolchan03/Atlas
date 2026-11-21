/**
 * An indexing that was cut off (app closed, phone out of memory) keeps the passages it finished embedding, and the next run embeds only the rest.
 * Real SQLite; only the embedding model is faked.
 */
import { installRealSqlite } from '../../harness/sqliteFake';

it('embeds only the passages that still lack an embedding, one slice at a time, saving each slice', async () => {
  installRealSqlite();
  const calls: string[][] = [];
  jest.doMock('../../../src/services/rag/embedding', () => ({
    embeddingService: { load: jest.fn(async () => undefined), isLoaded: () => true, embedBatch: jest.fn(async (texts: string[]) => { calls.push(texts); return texts.map(() => [1, 0, 0]); }) },
  }));
  const { ragDatabase: db } = require('../../../src/services/rag/database');
  const { ragService } = require('../../../src/services/rag');
  await db.ensureReady();
  const docId = db.insertDocument({ projectId: 'p', name: 'book.txt', path: '/book', size: 1 });
  const texts = Array.from({ length: 70 }, (_, i) => `passage ${i}`);
  const rowIds: number[] = db.insertChunks(docId, texts.map((content, position) => ({ content, position })));
  // The first 40 were embedded before the process died.
  db.insertEmbeddingsBatch(rowIds.slice(0, 40).map((chunkRowid) => ({ chunkRowid, docId, embedding: [1, 0, 0] })));
  expect(db.getUnembeddedChunks(docId)).toHaveLength(30);

  const added = await ragService.backfillEmbeddings('p');

  expect(added).toBe(30);
  expect(calls.flat()).toEqual(texts.slice(40)); // nothing already done is done again
  expect(db.getUnembeddedChunks(docId)).toHaveLength(0);
  expect(await ragService.backfillEmbeddings('p')).toBe(0); // and a second run has nothing left
});

it('saves a slice before starting the next, so a failure part-way leaves the finished slices embedded', async () => {
  installRealSqlite();
  let slice = 0;
  jest.doMock('../../../src/services/rag/embedding', () => ({
    embeddingService: { load: jest.fn(async () => undefined), isLoaded: () => true, embedBatch: jest.fn(async (texts: string[]) => { slice += 1; if (slice === 2) throw new Error('out of memory'); return texts.map(() => [1, 0, 0]); }) },
  }));
  const { ragDatabase: db } = require('../../../src/services/rag/database');
  const { ragService } = require('../../../src/services/rag');
  await db.ensureReady();
  const docId = db.insertDocument({ projectId: 'p', name: 'big.txt', path: '/big', size: 1 });
  db.insertChunks(docId, Array.from({ length: 100 }, (_, i) => ({ content: `part ${i}`, position: i })));
  await ragService.backfillEmbeddings('p'); // the second slice fails; the error is logged, not thrown
  expect(db.getUnembeddedChunks(docId)).toHaveLength(68); // the first slice of 32 was kept
});

it('resumeIndexing finishes an interrupted document, runs once at a time, and leaves a chat reply alone', async () => {
  installRealSqlite();
  let generating = true;
  jest.doMock('../../../src/services/llm', () => ({ llmService: { isCurrentlyGenerating: () => generating } }));
  jest.doMock('../../../src/services/rag/embedding', () => ({
    embeddingService: { load: jest.fn(async () => undefined), isLoaded: () => true, embedBatch: jest.fn(async (texts: string[]) => { await new Promise((r) => setTimeout(r, 10)); return texts.map(() => [1, 0, 0]); }) },
  }));
  const { ragDatabase: db } = require('../../../src/services/rag/database');
  const { ragService } = require('../../../src/services/rag');
  await db.ensureReady();
  const docId = db.insertDocument({ projectId: 'p', name: 'a.txt', path: '/a', size: 1 });
  db.insertChunks(docId, [{ content: 'one', position: 0 }, { content: 'two', position: 1 }]);
  expect(await ragService.resumeIndexing('p')).toBe(0); // a reply is being written: it goes first
  generating = false;
  const [first, second] = await Promise.all([ragService.resumeIndexing('p'), ragService.resumeIndexing('p')]);
  expect([first, second].sort()).toEqual([0, 2]); // one run did the work, the other did not start a second
  expect(db.getUnembeddedChunks(docId)).toHaveLength(0);
});

it('does not embed the passages of a document that is still being indexed, and embeds one batch at a time', async () => {
  installRealSqlite();
  let running = 0;
  let overlapped = false;
  jest.doMock('../../../src/services/llm', () => ({ llmService: { isCurrentlyGenerating: () => false } }));
  jest.doMock('../../../src/services/rag/embedding', () => ({
    embeddingService: { load: jest.fn(async () => undefined), isLoaded: () => true, embedBatch: jest.fn(async (texts: string[]) => { running += 1; if (running > 1) overlapped = true; await new Promise((r) => setTimeout(r, 15)); running -= 1; return texts.map(() => [1, 0, 0]); }) },
  }));
  jest.doMock('../../../src/services/documentService', () => ({ documentService: { processDocumentFromPath: jest.fn(async () => ({ id: '1', type: 'document', uri: '/new', fileName: 'new.txt', textContent: 'A sentence long enough to be indexed as a passage of its own. '.repeat(40), fileSize: 100 })) } }));
  const { ragDatabase: db } = require('../../../src/services/rag/database');
  const { ragService } = require('../../../src/services/rag');
  await db.ensureReady();
  const oldDoc = db.insertDocument({ projectId: 'p', name: 'old.txt', path: '/old', size: 1 });
  db.insertChunks(oldDoc, [{ content: 'an interrupted passage', position: 0 }]);
  const indexing = ragService.indexDocument({ projectId: 'p', filePath: '/new', fileName: 'new.txt', fileSize: 100 });
  await new Promise((r) => setTimeout(r, 1));
  expect(await ragService.resumeIndexing('p')).toBe(0); // the project is being indexed: its half-done passages are left to it
  await indexing;
  expect(await ragService.resumeIndexing('p')).toBe(1); // afterwards, the interrupted one is finished
  expect(overlapped).toBe(false);
});
