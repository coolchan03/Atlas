/**
 * Chunks of a PDF that remember their page: each page is read on its own and every chunk starts with "(p. 123)", so a search result,
 * the answer built from it and the "Cite my books" quote can all say which page they came from. Returns null when the phone cannot
 * read the PDF page by page (the whole-text path is used instead).
 */
import { pdfExtractPages, pdfPageCount } from '../pdfExtractor';
import { chunkDocument, type Chunk } from './chunking';

const BATCH = 20;
const MAX_CHARS = 3_000_000;
const MAX_PAGES = 3000;

export async function pagedChunks(path: string): Promise<Chunk[] | null> {
  try {
    const pages = Math.min(await pdfPageCount(path), MAX_PAGES);
    if (!pages) return null;
    const out: Chunk[] = [];
    let chars = 0;
    for (let start = 0; start < pages && chars < MAX_CHARS; start += BATCH) {
      const texts = await pdfExtractPages(path, start, Math.min(BATCH, pages - start));
      for (let i = 0; i < texts.length && chars < MAX_CHARS; i++) {
        const text = (texts[i] ?? '').trim();
        if (!text) continue;
        chars += text.length;
        for (const c of chunkDocument(text)) out.push({ content: `(p. ${start + i + 1}) ${c.content}`, position: out.length });
      }
    }
    return chars >= 100 && out.length ? out : null;
  } catch { return null; }
}
