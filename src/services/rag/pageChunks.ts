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

/** A page with less text than this is a picture of text (a scan), not a page with a text layer. */
const MIN_PAGE_CHARS = 30;
/** The most pages read from pictures in one document: reading a page with a vision model takes seconds, and a scanned book has hundreds. */
export const MAX_OCR_PAGES = 300;

export interface PagedOptions { /** Called as scanned pages are read, with the page number and how many scanned pages will be read. */ onOcr?: (page: number, done: number) => void }
export interface PagedResult { chunks: Chunk[]; /** Pages whose text was read from a picture by the vision model. */ ocrPages: number[]; /** Scanned pages left unread because of the page limit or because no vision model was loaded. */ skipped: number }

/** Whether a vision model is loaded, so scanned pages can be read. */
export function canReadScans(): boolean {
  try { return require('../../knowledge/ocr').ocrAvailable(); } catch { return false; }
}

export async function pagedChunks(path: string, opts: PagedOptions = {}): Promise<Chunk[] | null> {
  const r = await pagedChunksWithScans(path, opts);
  return r?.chunks ?? null;
}

/**
 * Like pagedChunks, and a page with no text layer (a scan) is read from its picture by the vision model when one is loaded, as the
 * Knowledge feature does. OCR text can have misread characters, so those page numbers are returned for the caller to say so.
 */
export async function pagedChunksWithScans(path: string, opts: PagedOptions = {}): Promise<PagedResult | null> {
  try {
    const pages = Math.min(await pdfPageCount(path), MAX_PAGES);
    if (!pages) return null;
    const out: Chunk[] = [];
    const ocrPages: number[] = [];
    let skipped = 0;
    const scans = canReadScans();
    let chars = 0;
    for (let start = 0; start < pages && chars < MAX_CHARS; start += BATCH) {
      const texts = await pdfExtractPages(path, start, Math.min(BATCH, pages - start));
      for (let i = 0; i < texts.length && chars < MAX_CHARS; i++) {
        let text = (texts[i] ?? '').trim();
        if (text.replace(/\s/g, '').length < MIN_PAGE_CHARS) {
          // A page with no text layer: read it from its picture, within the limit, or count it as skipped.
          if (!scans || ocrPages.length >= MAX_OCR_PAGES) { skipped += 1; continue; }
          try { text = (await require('../../knowledge/ocr').ocrPage(path, start + i)).trim(); } catch { text = ''; }
          if (text.replace(/\s/g, '').length < MIN_PAGE_CHARS) { skipped += 1; continue; }
          ocrPages.push(start + i + 1);
          opts.onOcr?.(start + i + 1, ocrPages.length);
        }
        chars += text.length;
        for (const c of chunkDocument(text)) out.push({ content: `(p. ${start + i + 1}) ${c.content}`, position: out.length });
      }
    }
    return chars >= 100 && out.length ? { chunks: out, ocrPages, skipped } : null;
  } catch { return null; }
}
