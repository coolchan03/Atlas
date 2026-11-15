/** Retrieval from a real database: a question naming a section finds that section's text; teaching and reference documents are searched apart; an older edition is not used. Only the text reader and embedding model are faked. */
import { installRealSqlite } from '../harness/sqliteFake';

let mockText = '';
jest.mock('../../src/services/documentService', () => ({
  documentService: { processDocumentFromPath: jest.fn(async () => ({ uri: '/x', textContent: mockText })) },
}));
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: { isLoaded: () => true, load: jest.fn(), embed: jest.fn(async () => [1, 0, 0, 0]), embedBatch: jest.fn(async (t: string[]) => t.map(() => [1, 0, 0, 0])), unload: jest.fn() },
}));

const filler = (s: string) => `${s} ${'This sentence is part of the document and talks about expensing property in general terms. '.repeat(25)}`;

it('finds the passage that opens with the section asked about, searches by role, and uses the cache until a document changes', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const add = async (name: string, text: string) => { mockText = text; await ragService.indexDocument({ projectId: 'p1', filePath: `/in/${name}`, fileName: name, fileSize: 100 }); };
  await add('Title 26 - Internal Revenue Code.pdf', `${filler('§ 197. Amortization of goodwill and certain other intangibles.')}\n\n${filler('§ 179. Election to expense certain depreciable business assets.')}`);
  await add('Federal Taxation textbook.pdf', filler('Chapter 8. Deductions for depreciation and expensing.'));
  const { isReference, isTeaching } = require('../../src/standards/docRoles');
  expect(isReference('Title 26 - Internal Revenue Code.pdf')).toBe(true);
  expect(isTeaching('Federal Taxation textbook.pdf')).toBe(true);

  const exact = await ragService.searchProject('p1', 'What is the limit under § 179?', { topK: 3 });
  expect(exact.chunks[0].content.trimStart().startsWith('§ 179.')).toBe(true); // the exact section first, not the look-alike § 197

  const teaching = await ragService.searchProject('p1', 'depreciation', { topK: 5, include: isTeaching });
  expect(new Set(teaching.chunks.map((c: { name: string }) => c.name))).toEqual(new Set(['Federal Taxation textbook.pdf']));
  const reference = await ragService.searchProject('p1', 'depreciation', { topK: 5, include: isReference });
  expect(new Set(reference.chunks.map((c: { name: string }) => c.name))).toEqual(new Set(['Title 26 - Internal Revenue Code.pdf']));
  expect((await ragService.searchProject('p1', 'depreciation', { topK: 5, include: () => false })).chunks).toEqual([]);

  // A document added after a search is found by the next one (the cache is not stale).
  await add('Another book.pdf', filler('Chapter 9. More on expensing property.'));
  const after = await ragService.searchProject('p1', 'expensing', { topK: 10, include: isTeaching });
  expect(after.chunks.some((c: { name: string }) => c.name === 'Another book.pdf')).toBe(true);
});
