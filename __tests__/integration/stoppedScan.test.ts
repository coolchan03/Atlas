/** Pressing Stop while a scanned PDF is being read adds nothing and leaves no mark behind. Real database; the PDF reader, the vision model and the embedding model are the boundary. */
import { installRealSqlite } from '../harness/sqliteFake';

jest.mock('../../src/services/documentService', () => ({ documentService: { processDocumentFromPath: jest.fn(async () => ({ uri: '/copy/scan.pdf', textContent: '' })) } }));
jest.mock('../../src/services/rag/embedding', () => ({ embeddingService: { isLoaded: () => true, load: jest.fn(), embed: jest.fn(async () => [1, 0, 0, 0]), embedBatch: jest.fn(async (t: string[]) => t.map(() => [1, 0, 0, 0])), unload: jest.fn() } }));
jest.mock('../../src/services/pdfExtractor', () => ({
  pdfPageCount: jest.fn(async () => 3), pdfExtractPages: jest.fn(async () => ['', '', '']), pdfRenderPage: jest.fn(async (_p: string, i: number) => `/tmp/page-${i}.png`),
}));
jest.mock('../../src/services/llm', () => ({ llmService: { isModelLoaded: () => true, supportsVision: () => true, isCurrentlyGenerating: () => false,
  generateResponse: jest.fn(async () => `Accounting Standards Update. Financial Accounting Standards Board. ${'The lessee records a right-of-use asset at commencement. '.repeat(5)}`) } }));

it('adds no document and no mark when stopped between scanned pages, and adds it with the mark when not', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { useOfficialDocs } = require('../../src/standards/officialDocs');
  const { IndexStopped } = require('../../src/services/rag/indexControl');
  await expect(ragService.indexDocument({ projectId: 'p1', filePath: '/in/scan.pdf', fileName: 'scan.pdf', fileSize: 1, gate: async () => false })).rejects.toBeInstanceOf(IndexStopped);
  expect(await ragService.getDocumentsByProject('p1')).toHaveLength(0);
  expect(useOfficialDocs.getState().names).toEqual([]);
  await ragService.indexDocument({ projectId: 'p1', filePath: '/in/scan.pdf', fileName: 'scan.pdf', fileSize: 1 });
  expect(await ragService.getDocumentsByProject('p1')).toHaveLength(1);
  expect(useOfficialDocs.getState().names).toEqual(['scan.pdf']); // recognised from the first scanned pages
});
