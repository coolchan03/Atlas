// PDFExtractorModule for the web / Windows builds, on pdf.js: text, page count, per-page text, page -> PNG.
import { registerNativeModule } from './registry';
import { fs, norm, dirName } from '../host/fs';

let lib: Promise<any> | null = null;
async function pdfjs() {
  return (lib ??= (async () => {
    const mod: any = await import('pdfjs-dist/build/pdf.mjs');
    const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    mod.GlobalWorkerOptions.workerSrc = worker.default;
    return mod;
  })());
}
const docs = new Map<string, Promise<any>>();
async function open(path: string) {
  const p = norm(path);
  let d = docs.get(p);
  if (!d) {
    d = (async () => {
      const lib = await pdfjs();
      const data = await fs().readFile(p);
      return lib.getDocument({ data: data.slice(), isEvalSupported: false, useSystemFonts: true }).promise;
    })();
    d.catch(() => docs.delete(p));
    docs.set(p, d);
    if (docs.size > 4) { const first = docs.keys().next().value as string; void docs.get(first)?.then((x: any) => x.destroy()).catch(() => undefined); docs.delete(first); }
  }
  return d;
}
async function pageText(doc: any, i: number): Promise<string> {
  const page = await doc.getPage(i + 1);
  const tc = await page.getTextContent();
  let out = '';
  let lastY: number | null = null;
  for (const it of tc.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>) {
    const y = it.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2 && out && !out.endsWith('\n')) out += '\n';
    out += it.str;
    if (it.hasEOL) out += '\n';
    lastY = y ?? lastY;
  }
  page.cleanup();
  return out.replace(/[ \t]+\n/g, '\n').trim();
}

registerNativeModule('PDFExtractorModule', {
  async extractText(path: string, maxChars: number) {
    const doc = await open(path);
    let out = '';
    for (let i = 0; i < doc.numPages && out.length < maxChars; i++) out += (await pageText(doc, i)) + '\n\n';
    return out.slice(0, maxChars).trim();
  },
  async pageCount(path: string) { return (await open(path)).numPages as number; },
  async extractPages(path: string, start: number, count: number) {
    const doc = await open(path);
    const out: string[] = [];
    for (let i = start; i < Math.min(doc.numPages, start + count); i++) out.push(await pageText(doc, i));
    return out;
  },
  async renderPage(path: string, index: number, maxWidth: number) {
    const doc = await open(path);
    const page = await doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, maxWidth / base.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/png'));
    const out = `/atlas/cache/pdf-pages/${Date.now()}-${index}.png`;
    await fs().mkdir(dirName(out));
    await fs().writeFile(out, blob);
    page.cleanup();
    return out;
  },
});
