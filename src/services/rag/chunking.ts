export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
  minChunkLength?: number;
}

export interface Chunk {
  content: string;
  position: number;
}

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 100;
const DEFAULT_MIN_CHUNK_LENGTH = 20;

/** Where a window that would end at `end` should really end: just after the last sentence end, else the last space, within the last fifth of the window. */
export function softEnd(text: string, start: number, end: number): number {
  if (end >= text.length) return text.length;
  const floor = end - Math.floor((end - start) * 0.2);
  for (let i = end; i > floor; i -= 1) if (/[.!?\n]/.test(text[i - 1]) && /\s/.test(text[i] ?? ' ')) return i;
  for (let i = end; i > floor; i -= 1) if (/\s/.test(text[i - 1])) return i;
  return end;
}

/** The next window starts at the start of a word, not in the middle of one (moving on by at most 30 characters; text with no spaces is left as it is). */
function wordStart(text: string, at: number): number {
  const limit = Math.min(text.length, at + 30);
  for (let i = Math.max(1, at); i < limit; i += 1) if (/\s/.test(text[i - 1])) return i;
  return Math.max(0, at);
}

function slidingWindowChunks(
  params: { text: string; chunkSize: number; overlap: number; minLength: number },
  chunks: Chunk[], startPosition: number,
): number {
  const { text, chunkSize, overlap, minLength } = params;
  let pos = startPosition;
  let start = 0;
  while (start < text.length) {
    // Windows end at a sentence (or at least a word), so a fact is not cut in half where it can be avoided.
    const end = softEnd(text, start, start + chunkSize);
    const slice = text.slice(start, end);
    if (slice.trim().length >= minLength) {
      chunks.push({ content: slice.trim(), position: pos++ });
    }
    if (end >= text.length) break;
    start = Math.max(start + 1, wordStart(text, end - overlap));
  }
  return pos;
}

function flushChunk(
  opts: { chunk: string; minLength: number },
  chunks: Chunk[], position: number,
): number {
  if (opts.chunk.trim().length >= opts.minLength) {
    chunks.push({ content: opts.chunk.trim(), position });
    return position + 1;
  }
  return position;
}

/**
 * In a Markdown document a chunk is told where it sits ("[Chapter 2 > Cash flow]"), so a search result and the answer built from
 * it keep their place in the document. A chunk that already starts with a heading is left as it is; text without headings is
 * unchanged.
 */
export function withSectionContext(text: string, chunks: Chunk[]): Chunk[] {
  if (!text || !chunks.length) return chunks;
  const heads = [...text.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm)].map((m) => ({ at: m.index ?? 0, level: m[1].length, title: m[2] }));
  if (!heads.length) return chunks;
  let from = 0;
  return chunks.map((c) => {
    // Found by its first line: a heading is joined to its text with one line break where the document had a blank line, so the whole start would not match.
    const found = text.indexOf(c.content.split('\n')[0].slice(0, 80), from);
    if (found >= 0) from = found;
    const stack: typeof heads = [];
    for (const h of heads) {
      if (h.at > from) break;
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
    }
    const path = stack.map((h) => h.title).join(' > ');
    if (!path) return c;
    if (!/^#{1,6}\s/.test(c.content)) return { ...c, content: `[${path}]\n${c.content}` };
    // A chunk that starts with its own heading (a heading stays with its text): when it sits inside other sections, the path replaces that line
    // (the path ends with the same title), so the place is shown once. A top-level heading is left as it is.
    const rest = c.content.slice(c.content.indexOf('\n') + 1);
    return stack.length > 1 && c.content.includes('\n') && rest.trim() ? { ...c, content: `[${path}]\n${rest}` } : c;
  });
}

export function chunkDocument(text: string, options?: ChunkOptions): Chunk[] {
  return withSectionContext(text, plainChunks(text, options));
}

/** A short title-like line: a Markdown heading, or a line with no sentence ending such as "Lease classification" or "ASC 842-20-25". */
function isHeading(paragraph: string): boolean {
  const p = paragraph.trim();
  if (!p || p.includes('\n')) return false;
  if (/^#{1,6}\s/.test(p)) return true;
  return p.length <= 80 && !/[.!?:;,]$/.test(p) && /^[A-Z0-9\u00A7(]/.test(p);
}

/** A heading stays with the text it introduces: it is joined to the paragraph after it, so packing never leaves a title at the end of one chunk and its text in the next. */
export function joinHeadings(paragraphs: string[]): string[] {
  const out: string[] = [];
  let lead = '';
  for (const raw of paragraphs) {
    const p = raw.trim();
    if (!p) continue;
    if (isHeading(p)) { lead = lead ? `${lead}\n${p}` : p; continue; }
    out.push(lead ? `${lead}\n${p}` : p);
    lead = '';
  }
  if (lead) out.push(lead);
  return out;
}

function plainChunks(text: string, options?: ChunkOptions): Chunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const minLength = options?.minChunkLength ?? DEFAULT_MIN_CHUNK_LENGTH;

  if (!text || text.trim().length < minLength) return [];

  const paragraphs = joinHeadings(text.split(/\n\n+/));
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let position = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (trimmed.length > chunkSize) {
      position = flushChunk({ chunk: currentChunk, minLength }, chunks, position);
      currentChunk = '';
      position = slidingWindowChunks({ text: trimmed, chunkSize, overlap, minLength }, chunks, position);
      continue;
    }

    const candidate = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
    if (candidate.length > chunkSize) {
      position = flushChunk({ chunk: currentChunk, minLength }, chunks, position);
      currentChunk = trimmed;
    } else {
      currentChunk = candidate;
    }
  }

  flushChunk({ chunk: currentChunk, minLength }, chunks, position);
  return chunks;
}
