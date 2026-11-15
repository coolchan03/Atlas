/** A FASB standard is recognised from its first pages when it is added to a project, whatever the file is called. Real database; the text reader and embedding model are the device boundary. */
import { installRealSqlite } from '../harness/sqliteFake';

let mockText = '';
jest.mock('../../src/services/documentService', () => ({
  documentService: { processDocumentFromPath: jest.fn(async () => ({ uri: '/x', textContent: mockText })) },
}));
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: { isLoaded: () => true, load: jest.fn(), embed: jest.fn(async () => [1, 0, 0, 0]), embedBatch: jest.fn(async (t: string[]) => t.map(() => [1, 0, 0, 0])), unload: jest.fn() },
}));

const STANDARD = `Accounting Standards Update No. 2016-13\nFinancial Instruments, Credit Losses (Topic 326)\nFinancial Accounting Standards Board\n${'The amendments in this Update require measurement of expected credit losses. '.repeat(30)}`;
const BOOK = `Intermediate Accounting, Chapter 7. ${'Receivables are reported at their net realizable value in practice. '.repeat(30)}`;

it('marks the added document as the official standard when its first pages say so, and leaves a textbook alone', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { useOfficialDocs } = require('../../src/standards/officialDocs');
  const { isOfficialDocumentName } = require('../../src/standards/authority');
  mockText = STANDARD;
  await ragService.indexDocument({ projectId: 'p1', filePath: '/in/scan_0042.pdf', fileName: 'scan_0042.pdf', fileSize: 100 });
  mockText = BOOK;
  await ragService.indexDocument({ projectId: 'p1', filePath: '/in/Becker FAR.docx', fileName: 'Becker FAR.docx', fileSize: 100 });
  expect(useOfficialDocs.getState().names).toEqual(['scan_0042.pdf']);
  expect(isOfficialDocumentName('scan_0042.pdf')).toBe(true);
  expect(isOfficialDocumentName('Becker FAR.docx')).toBe(false);
});
