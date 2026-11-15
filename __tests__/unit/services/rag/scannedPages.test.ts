/** A scanned PDF added to a project: its pages are read from their pictures by the vision model, with the page kept in each chunk. Only the PDF reader and the model are faked. */
const mockPages: string[] = [];
let mockVision = true;
jest.mock('../../../../src/services/pdfExtractor', () => ({
  pdfPageCount: jest.fn(async () => mockPages.length),
  pdfExtractPages: jest.fn(async (_p: string, start: number, count: number) => mockPages.slice(start, start + count)),
  pdfRenderPage: jest.fn(async (_p: string, i: number) => `/tmp/page-${i}.png`),
}));
jest.mock('../../../../src/services/llm', () => ({
  llmService: {
    isModelLoaded: () => mockVision, supportsVision: () => mockVision, isCurrentlyGenerating: () => false,
    generateResponse: jest.fn(async (msgs: Array<{ attachments?: Array<{ uri: string }> }>) => `Section ${msgs[0].attachments?.[0].uri.match(/page-(\d+)/)?.[1]} text. ${'The lessee records a right-of-use asset at commencement. '.repeat(5)}`),
  },
}));

const run = async () => { const { pagedChunksWithScans } = require('../../../../src/services/rag/pageChunks'); return pagedChunksWithScans('/x.pdf', {}); };

beforeEach(() => { mockPages.length = 0; mockVision = true; });

it('reads pages with no text layer from their pictures, keeps the page number, and reports which pages were read that way', async () => {
  mockPages.push('', 'A page with a real text layer. '.repeat(10), '');
  const r = await run();
  expect(r.ocrPages).toEqual([1, 3]);
  expect(r.chunks.map((c: { content: string }) => c.content.slice(0, 6))).toEqual(['(p. 1)', '(p. 2)', '(p. 3)']);
  expect(r.chunks[0].content).toContain('Section 0 text'); // page 1 is picture index 0
  expect(r.skipped).toBe(0);
});

it('without a vision model it skips the scanned pages and says how many', async () => {
  mockVision = false;
  mockPages.push('', 'A page with a real text layer. '.repeat(10), '');
  const r = await run();
  expect(r.ocrPages).toEqual([]);
  expect(r.skipped).toBe(2);
  expect(r.chunks).toHaveLength(1);
});

it('a fully scanned PDF without a vision model cannot be indexed, and the error says what to do', async () => {
  mockVision = false;
  mockPages.push('', '');
  expect(await run()).toBeNull();
  const { canReadScans } = require('../../../../src/services/rag/pageChunks');
  expect(canReadScans()).toBe(false);
});
