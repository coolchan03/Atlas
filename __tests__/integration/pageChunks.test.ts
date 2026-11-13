/** A PDF read page by page keeps each chunk's page number; a PDF the phone cannot read by page returns null so the whole-text path is used. The native PDF reader is the device boundary. */
const mockPages = ['First page about basis. '.repeat(30), '', 'Third page about leases and the lessee. '.repeat(30)];
let mockFail = false;
jest.mock('../../src/services/pdfExtractor', () => ({
  pdfPageCount: async () => { if (mockFail) throw new Error('no page reading'); return mockPages.length; },
  pdfExtractPages: async (_p: string, start: number, count: number) => mockPages.slice(start, start + count),
}));
import { pagedChunks } from '../../src/services/rag/pageChunks';

it('starts every chunk with its page number and skips empty pages', async () => {
  const chunks = (await pagedChunks('/book.pdf'))!;
  expect(chunks[0].content.startsWith('(p. 1) ')).toBe(true);
  expect(chunks.some((c) => c.content.startsWith('(p. 2)'))).toBe(false);
  expect(chunks.filter((c) => c.content.startsWith('(p. 3) ')).length).toBeGreaterThan(1);
  expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
});

it('returns null when the PDF cannot be read by page', async () => {
  mockFail = true;
  expect(await pagedChunks('/book.pdf')).toBeNull();
  mockFail = false;
});
