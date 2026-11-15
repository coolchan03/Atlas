/** "Check these lines": a line is backed by a passage in the project (the law first), else found on an official site, else left unverified, and an unreachable web is not taken for "no support". Real database; the embedding model and the web search are the boundary. */
import { installRealSqlite } from '../harness/sqliteFake';

let mockText = '';
jest.mock('../../src/services/documentService', () => ({ documentService: { processDocumentFromPath: jest.fn(async () => ({ uri: '/x', textContent: mockText })) } }));
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: { isLoaded: () => true, load: jest.fn(), embed: jest.fn(async () => [1, 0, 0, 0]), embedBatch: jest.fn(async (t: string[]) => t.map(() => [1, 0, 0, 0])), unload: jest.fn() },
}));

const LAW = `§ 179. Election to expense certain depreciable business assets. A taxpayer may elect to treat the cost of any section 179 property as an expense which is not chargeable to capital account. ${'Filler about property and basis. '.repeat(30)}`;

it('backs a line from the law in the project, finds another on an official site, and says when the web could not be reached', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  mockText = LAW;
  await ragService.indexDocument({ projectId: 'p1', filePath: '/in/Title 26 - Internal Revenue Code.pdf', fileName: 'Title 26 - Internal Revenue Code.pdf', fileSize: 100 });
  const { verifyLines, verdictText } = require('../../src/topics/verifyLines');
  const claims = [
    'A taxpayer may elect to treat the cost of section 179 property as an expense not chargeable to capital account.',
    'Leases under ASC 842 need a right-of-use asset recorded at commencement for every lessee contract.',
    'Quantum accounting requires entangled ledgers of every subsidiary company.',
  ];
  const search = async (q: string) => (/asc 842|fasb/i.test(q) ? [{ title: 'ASC 842 Leases: lessee records a right-of-use asset at commencement for every lease contract', url: 'https://asc.fasb.org/842', snippet: 'A lessee recognizes a right-of-use asset at commencement for each lease contract.' }] : []);
  const out = await verifyLines(claims, { projectId: 'p1', search });
  expect(out.map((v: { status: string }) => v.status)).toEqual(['backed', 'found-online', 'unverified']);
  expect(out[0].source).toBe('Title 26 - Internal Revenue Code.pdf');
  expect(verdictText(out[1])).toMatch(/Found at ASC 842/);
  const offline = await verifyLines([claims[1]], { projectId: 'p1', search: async () => { throw new Error('offline'); } });
  expect(offline[0].status).toBe('offline');
});
