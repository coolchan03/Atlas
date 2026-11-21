/** The library size, and pausing or stopping while documents are added. Real database; the text reader and embedding model are the boundary. */
import { installRealSqlite } from '../harness/sqliteFake';

let mockText = '';
jest.mock('../../src/services/documentService', () => ({ documentService: { processDocumentFromPath: jest.fn(async () => ({ uri: '/x', textContent: mockText })) } }));
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: { isLoaded: () => true, load: jest.fn(), embed: jest.fn(async () => [1, 0, 0, 0]), embedBatch: jest.fn(async (t: string[]) => t.map(() => [1, 0, 0, 0])), unload: jest.fn() },
}));

it('says how many documents and passages a project has and how much space they take', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { describeLibrary } = require('../../src/services/rag/libraryStats');
  mockText = `Leases. ${'The lessee records a right-of-use asset at commencement. '.repeat(60)}`;
  await ragService.indexDocument({ projectId: 'p1', filePath: '/in/a.txt', fileName: 'a.txt', fileSize: 10 });
  await ragService.indexDocument({ projectId: 'p1', filePath: '/in/b.txt', fileName: 'b.txt', fileSize: 10 });
  const stats = await ragService.libraryStats('p1');
  expect(stats.documents).toHaveLength(2);
  expect(stats.documents[0].chunks).toBeGreaterThan(0);
  expect(stats.embeddingBytes).toBeGreaterThan(0);
  expect(describeLibrary(stats)).toMatch(/^2 documents, [\d,]+ passages, about [\d.]+ MB of search data/);
  expect(describeLibrary(await ragService.libraryStats('empty'))).toBe('');
});

it('waits while paused, goes on when resumed, and stops for good when stopped', async () => {
  const { useIndexControl, gate } = require('../../src/services/rag/indexControl');
  const c = useIndexControl.getState();
  c.reset();
  expect(await gate()).toBe(true);
  c.pause();
  let result: boolean | null = null;
  const waiting = gate().then((v: boolean) => { result = v; });
  await new Promise((r) => setImmediate(r));
  expect(result).toBeNull(); // still waiting
  c.resume();
  await waiting;
  expect(result).toBe(true);
  c.pause();
  const stopping = gate();
  c.stop();
  expect(await stopping).toBe(false);
  expect(await gate()).toBe(false);
  c.reset();
});

it('clears a pause when a run ends (never stuck), and does not clear it under another run that is still going', () => {
  const { useIndexControl } = require('../../src/services/rag/indexControl');
  const c = useIndexControl.getState();
  c.begin(); c.begin();
  c.pause();
  c.end(); // one run is still going: the pause stays
  expect(useIndexControl.getState().paused).toBe(true);
  c.end(); // the last run ended: nothing is left paused
  expect(useIndexControl.getState().paused).toBe(false);
});
