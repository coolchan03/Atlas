import { chunkDocument, type Chunk, type ChunkOptions } from './chunking';

/**
 * Splits a document where its own structure does: a legal provision (§ 162, Section 4, Article II, Rule 12), a numbered heading
 * (2.3.1 Title) or a question and its answer. Every passage keeps its section label in front, so a result says where it came from.
 * A document with fewer than three such markers has no structure to follow: null, and the ordinary chunking is used.
 */
const MARKERS: RegExp[] = [
  /^(?:\u00a7{1,2}\s*\d[\w.\-()]*)(?=[.\s:\u2014-]|$)/,
  /^(?:Section|Sec\.)\s+\d[\w.\-()]*/i,
  /^(?:ARTICLE|Article)\s+[IVXLC\d]+\b/,
  /^(?:CHAPTER|Chapter|PART|Part|RULE|Rule|STANDARD|Standard)\s+[\dIVXLC]+[\w.\-]*/,
  /^\d+(?:\.\d+){1,4}[.)]?\s+[A-Z\u00a7(]/,
  /^(?:Q:|Q\.|Question\s*\d*\s*[:.])/i,
];
const markerOf = (line: string): string | null => {
  const t = line.trim();
  if (t.length > 140 || !t) return null;
  for (const re of MARKERS) if (re.test(t)) return t.replace(/\s+/g, ' ').slice(0, 90);
  return null;
};

/** A Markdown table cut into pieces of at most `max` characters, each with its header row, so no row ever loses its column names. */
export function tableChunks(table: string, max: number): string[] {
  const lines = table.split('\n').filter((l) => l.trim());
  if (lines.length < 3 || table.length <= max) return [table.trim()];
  const head = `${lines[0]}\n${lines[1]}`;
  const out: string[] = []; let cur: string[] = [];
  for (const row of lines.slice(2)) {
    if (cur.length && head.length + cur.join('\n').length + row.length > max) { out.push(`${head}\n${cur.join('\n')}`); cur = []; }
    cur.push(row);
  }
  if (cur.length) out.push(`${head}\n${cur.join('\n')}`);
  return out;
}

function sectionBodies(body: string, options: ChunkOptions): string[] {
  const max = options.chunkSize ?? 500;
  const out: string[] = [];
  let prose: string[] = [];
  const flush = () => { if (prose.length) { for (const c of chunkDocument(prose.join('\n\n'), options)) out.push(c.content); prose = []; } };
  for (const block of body.split(/\n\n+/)) {
    if (/^\s*\|.*\|\s*$/m.test(block) && /^\s*\|[\s:|-]+\|\s*$/m.test(block)) { flush(); out.push(...tableChunks(block, Math.max(max * 2, 1200))); } else prose.push(block);
  }
  flush();
  return out;
}

export function structureAwareChunks(text: string, options: ChunkOptions = {}): Chunk[] | null {
  const lines = text.split('\n');
  const starts: Array<{ at: number; label: string }> = [];
  lines.forEach((l, i) => { const m = markerOf(l); if (m) starts.push({ at: i, label: m }); });
  if (starts.length < 3) return null;
  const chunks: Chunk[] = [];
  const emit = (label: string | null, body: string) => {
    for (const piece of sectionBodies(body, options)) if (piece.trim().length >= (options.minChunkLength ?? 20)) chunks.push({ position: chunks.length, content: label && !piece.startsWith(`[${label}]`) ? `[${label}]\n${piece}` : piece });
  };
  if (starts[0].at > 0) emit(null, lines.slice(0, starts[0].at).join('\n').trim());
  starts.forEach((s, i) => emit(s.label, lines.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : lines.length).join('\n').trim()));
  return chunks.length ? chunks : null;
}
