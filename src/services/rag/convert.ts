/**
 * Conversion for indexing: turns what a file contained into text that is easy to search and read, WITHOUT changing what it says.
 * Deterministic code only (no model). Anything removed is counted and reported in `notes`, never dropped silently; the original
 * file is kept separately by the importer, so the converted text can always be checked against it.
 */
export interface Converted { text: string; format: 'markdown' | 'text'; notes: string[] }

/** Common UTF-8-read-as-Windows-1252 sequences, repaired. Only exact sequences that are never valid text are touched. */
const MOJIBAKE: Array<[string, string]> = [
  ['â\u0080\u0099', '’'], ['â\u0080\u0098', '‘'], ['â\u0080\u009c', '“'], ['â\u0080\u009d', '”'],
  ['â\u0080\u0093', '–'], ['â\u0080\u0094', '—'], ['â\u0080¦', '…'], ['Â§', '§'],
  ['Â ', ' '], ['Ã©', 'é'], ['Ã¨', 'è'], ['Ã¼', 'ü'], ['Ã¶', 'ö'], ['Ã¤', 'ä'],
];

export function normalizeText(input: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  let t = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const before = t;
  for (const [bad, good] of MOJIBAKE) t = t.split(bad).join(good);
  if (t !== before) notes.push('repaired text encoding errors (for example curly quotes read as three odd characters)');
  const noControl = t.replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g, '');
  if (noControl !== t) notes.push('removed control characters');
  // Line-end hyphens are left alone: "trans-/fer" and "well-/known" look the same, and joining the second would change the text.
  t = noControl.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  return { text: t, notes };
}

/**
 * Lines that repeat on many pages (running headers, footers, page numbers) removed, when pages are marked by form feeds.
 * A line is removed only if it is short and appears on at least 60% of at least 4 pages. Reports how many lines went.
 */
export function stripRunningHeaders(text: string): { text: string; notes: string[] } {
  const pages = text.split('\f');
  if (pages.length < 4) return { text, notes: [] };
  // Only a page number at the start or end of a line is ignored when comparing: a number inside a sentence makes it a different line.
  const key = (l: string) => l.trim().replace(/^(?:page\s+)?\d+\s+|\s+(?:page\s+)?\d+$/gi, '#').toLowerCase();
  const counts = new Map<string, number>();
  for (const p of pages) for (const k of new Set(p.split('\n').map(key).filter((k2) => k2 && k2.length <= 80))) counts.set(k, (counts.get(k) ?? 0) + 1);
  const repeated = new Set([...counts].filter(([, n]) => n >= Math.ceil(pages.length * 0.6)).map(([k]) => k));
  if (!repeated.size) return { text, notes: [] };
  let removed = 0;
  const cleaned = pages.map((p) => p.split('\n').filter((l) => { const drop = repeated.has(key(l)) && l.trim().length > 0; if (drop) removed++; return !drop; }).join('\n'));
  return { text: cleaned.join('\n\n'), notes: [`removed ${removed} repeated page header/footer lines`] };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', sect: '§', para: '¶', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©' };
const decodeEntities = (s: string): string => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

function tableToMarkdown(html: string): string {
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => decodeEntities(c[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()));
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!rows.length || !width) return '';
  const pad = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill('')].join(' | ')} |`;
  return `\n\n${[pad(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(pad)].join('\n')}\n\n`;
}

/** A web page as Markdown: headings, lists, tables and links kept; scripts, styles and navigation (nav, header, footer, aside, forms) dropped and reported. */
export function htmlToMarkdown(html: string): Converted {
  const notes: string[] = [];
  let h = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '');
  const chrome = (h.match(/<(nav|header|footer|aside|form)[\s>]/gi) ?? []).length;
  h = h.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '');
  if (chrome) notes.push(`dropped ${chrome} page-navigation block(s) (menus, headers, footers, side panels)`);
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(h);
  if (body) h = body[1];
  h = h.replace(/<table[\s\S]*?<\/table>/gi, (t) => tableToMarkdown(t));
  h = h.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, t: string) => `\n\n${'#'.repeat(Number(n))} ${t.replace(/<[^>]+>/g, '').trim()}\n\n`)
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<(br|\/p|\/div|\/tr|\/section|\/article|\/blockquote)[^>]*>/gi, '\n').replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, t: string) => { const label = t.replace(/<[^>]+>/g, '').trim(); return label && /^https?:/i.test(href) ? `[${label}](${href})` : label; })
    .replace(/<[^>]+>/g, '');
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const text = decodeEntities(h).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: title && !/^#\s/m.test(text) ? `# ${decodeEntities(title).trim()}\n\n${text}` : text, format: 'markdown', notes };
}

/** CSV rows (RFC 4180: quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
/** A spreadsheet export as a Markdown table (the first row is the header). Every row is kept. */
export function csvToMarkdown(input: string): Converted {
  const rows = parseCsv(input);
  if (rows.length < 2) return { text: input.trim(), format: 'text', notes: [] };
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill('')].map((x) => x.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()).join(' | ')} |`;
  return { text: [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n'), format: 'markdown', notes: [`${rows.length - 1} data rows kept as a table`] };
}

/** Everything needed before chunking: pick the converter by file type, then clean the text. */
export function convertForIndexing(fileName: string, input: string): Converted {
  const lower = fileName.toLowerCase();
  let base: Converted;
  if (/\.html?$/.test(lower) || /^\s*<(!doctype html|html)/i.test(input)) base = htmlToMarkdown(input);
  else if (lower.endsWith('.csv')) base = csvToMarkdown(input);
  else base = { text: input, format: /\.(md|markdown)$/.test(lower) || /^#{1,6}\s/m.test(input) ? 'markdown' : 'text', notes: [] };
  const n = normalizeText(base.text);
  const h = stripRunningHeaders(n.text);
  return { text: h.text, format: base.format, notes: [...base.notes, ...n.notes, ...h.notes] };
}

/** A 53-bit hash of text (cyrb53), as hex. For spotting the same content under another name; not a security hash. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
