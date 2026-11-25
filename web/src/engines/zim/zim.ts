// A small ZIM (Kiwix offline library) reader in TypeScript: header, directory entries, title index, clusters
// (zstd, xz or stored). Reads only the bytes it needs from the file, so multi-GB archives work. Search is by
// title (prefix, several capitalisations); the archives' Xapian full-text index is not read.
import { decompress as zstd } from 'fzstd';

const MAGIC = 72173914;
export interface ZimInfo { title: string; language: string; description: string; articles: number; bytes: number; fulltext: boolean }
export interface ZimEntry { path: string; title: string; ns: string; redirect: boolean; mime: string }
export type Reader = (pos: number, len: number) => Promise<Uint8Array>;

const td = new TextDecoder();
async function xz(data: Uint8Array): Promise<Uint8Array> {
  const { XzReadableStream } = await import('xz-decompress');
  const src = new ReadableStream({ start(c) { c.enqueue(data); c.close(); } });
  return new Uint8Array(await new Response(new XzReadableStream(src)).arrayBuffer());
}

export class Zim {
  private titles: Promise<Uint32Array | null> | null = null;
  private cache = new Map<number, Promise<Dirent>>();
  private clusters = new Map<number, Promise<Uint8Array>>();
  private constructor(
    private read: Reader, readonly size: number, readonly h: Header, private mimes: string[],
  ) {}

  static async open(read: Reader, size: number): Promise<Zim> {
    const b = await read(0, 80);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (v.getUint32(0, true) !== MAGIC) throw new Error('This is not a ZIM file.');
    const u64 = (o: number) => Number(v.getBigUint64(o, true));
    const h: Header = {
      major: v.getUint16(4, true), minor: v.getUint16(6, true), entries: v.getUint32(24, true), clusters: v.getUint32(28, true),
      urlPtr: u64(32), titlePtr: u64(40), clusterPtr: u64(48), mimePtr: u64(56), mainPage: v.getUint32(64, true), checksum: u64(72),
    };
    const raw = await read(h.mimePtr, Math.min(4096, size - h.mimePtr));
    const mimes: string[] = [];
    for (let i = 0, s = 0; i < raw.length; i++) if (raw[i] === 0) { if (i === s) break; mimes.push(td.decode(raw.subarray(s, i))); s = i + 1; }
    return new Zim(read, size, h, mimes);
  }

  private async u64At(pos: number): Promise<number> {
    const b = await this.read(pos, 8);
    return Number(new DataView(b.buffer, b.byteOffset).getBigUint64(0, true));
  }
  private async dirent(index: number): Promise<Dirent> {
    let p = this.cache.get(index);
    if (!p) {
      p = (async () => {
        const off = await this.u64At(this.h.urlPtr + index * 8);
        const b = await this.read(off, 640);
        const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const mime = v.getUint16(0, true);
        const ns = String.fromCharCode(b[3]);
        const redirect = mime === 0xffff;
        const head = redirect ? 12 : 16;
        const entry: Dirent = redirect
          ? { redirect: true, target: v.getUint32(8, true), cluster: 0, blob: 0, ns, mime, url: '', title: '' }
          : { redirect: false, target: 0, cluster: v.getUint32(8, true), blob: v.getUint32(12, true), ns, mime, url: '', title: '' };
        let i = head;
        let e = b.indexOf(0, i);
        entry.url = td.decode(b.subarray(i, e < 0 ? b.length : e));
        i = e + 1;
        e = b.indexOf(0, i);
        entry.title = e < 0 ? '' : td.decode(b.subarray(i, e)) || entry.url;
        return entry;
      })();
      this.cache.set(index, p);
      if (this.cache.size > 4000) this.cache.delete(this.cache.keys().next().value as number);
    }
    return p;
  }

  /** Index of the entry with this namespace + url, or -1. */
  private async findUrl(ns: string, url: string): Promise<number> {
    const key = ns + url;
    let lo = 0, hi = this.h.entries - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const d = await this.dirent(mid);
      const k = d.ns + d.url;
      if (k === key) return mid;
      if (k < key) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  async metadata(name: string): Promise<string> {
    const i = await this.findUrl('M', name);
    if (i < 0) return '';
    try { return td.decode(await this.blob(await this.follow(i))); } catch { return ''; }
  }
  async info(fallbackTitle: string): Promise<ZimInfo> {
    const [title, name, language, description] = await Promise.all([this.metadata('Title'), this.metadata('Name'), this.metadata('Language'), this.metadata('Description')]);
    return { title: title || name || fallbackTitle, language, description, articles: this.h.entries, bytes: this.size, fulltext: false };
  }

  private async follow(index: number): Promise<number> {
    let i = index;
    for (let n = 0; n < 8; n++) { const d = await this.dirent(i); if (!d.redirect) return i; i = d.target; }
    throw new Error('redirect loop');
  }
  private async cluster(n: number): Promise<Uint8Array> {
    let p = this.clusters.get(n);
    if (!p) {
      p = (async () => {
        const start = await this.u64At(this.h.clusterPtr + n * 8);
        const end = n + 1 < this.h.clusters ? await this.u64At(this.h.clusterPtr + (n + 1) * 8) : this.h.checksum;
        const raw = await this.read(start, end - start);
        const kind = raw[0] & 0x0f;
        const body = raw.subarray(1);
        const data = kind === 5 ? zstd(body) : kind === 4 ? await xz(body) : body;
        return (raw[0] & 0x10 ? Object.assign(data, { wide: true }) : data) as Uint8Array;
      })();
      this.clusters.set(n, p);
      if (this.clusters.size > 6) this.clusters.delete(this.clusters.keys().next().value as number);
      p.catch(() => this.clusters.delete(n));
    }
    return p;
  }
  private async blob(index: number): Promise<Uint8Array> {
    const d = await this.dirent(index);
    const c: Uint8Array & { wide?: boolean } = await this.cluster(d.cluster);
    const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
    const w = c.wide ? 8 : 4;
    const off = (i: number) => (c.wide ? Number(v.getBigUint64(i * 8, true)) : v.getUint32(i * 4, true));
    void w;
    return c.subarray(off(d.blob), off(d.blob + 1));
  }

  /** The content of a path ("Albert_Einstein", or "A/Albert_Einstein" in old files). */
  async article(path: string): Promise<{ title: string; html: string; mime: string } | null> {
    const clean = path.replace(/^\/+/, '');
    const tries: Array<[string, string]> = /^[A-Za-z-]\//.test(clean) ? [[clean[0], clean.slice(2)], ['C', clean], ['A', clean]] : [['C', clean], ['A', clean]];
    for (const [ns, url] of tries) {
      const i = await this.findUrl(ns, url);
      if (i < 0) continue;
      const real = await this.follow(i);
      const d = await this.dirent(real);
      return { title: d.title, html: td.decode(await this.blob(real)), mime: this.mimes[d.mime] ?? '' };
    }
    return null;
  }
  async mainPage(): Promise<string | null> {
    if (this.h.mainPage === 0xffffffff) return null;
    const d = await this.dirent(await this.follow(this.h.mainPage));
    return d.url;
  }

  /** Entries whose title starts with `prefix` (content namespace only), via the title index. */
  async suggest(prefix: string, limit: number): Promise<ZimEntry[]> {
    const out: ZimEntry[] = [];
    const seen = new Set<string>();
    const variants = [...new Set([prefix, prefix.toLowerCase(), prefix.charAt(0).toUpperCase() + prefix.slice(1), prefix.replace(/\b\w/g, (c) => c.toUpperCase())])];
    for (const p of variants) {
      if (out.length >= limit) break;
      const total = await this.titleCount();
      let lo = 0, hi = total - 1;
      const titleAt = async (i: number) => { const idx = await this.titleIndex(i); const d = await this.dirent(idx); return { d, idx, key: d.ns + d.title }; };
      for (const ns of ['C', 'A']) {
        lo = 0; hi = total - 1;
        const key = ns + p;
        while (lo < hi) { const mid = (lo + hi) >> 1; if ((await titleAt(mid)).key < key) lo = mid + 1; else hi = mid; }
        for (let i = lo; i < total && out.length < limit; i++) {
          const { d, idx, key: k } = await titleAt(i);
          if (!k.startsWith(key)) break;
          const real = await this.follow(idx).catch(() => -1);
          if (real < 0) continue;
          const target = await this.dirent(real);
          if (seen.has(target.url)) continue;
          if (/^(image|application\/(javascript|json)|text\/(css|javascript))/.test(this.mimes[target.mime] ?? '')) continue;
          seen.add(target.url);
          out.push({ path: target.url, title: target.title, ns: target.ns, redirect: d.redirect, mime: this.mimes[target.mime] ?? '' });
        }
      }
    }
    return out;
  }
  /**
   * Entry numbers in title order. Old files keep that list at `titlePtr`; new files (the pointer is all ones) store it as the
   * entry `X/listing/titleOrdered/v0` (or v1): a plain array of little-endian u32 entry numbers.
   */
  private titleList(): Promise<Uint32Array | null> {
    return (this.titles ??= (async () => {
      if (this.h.titlePtr < this.size) return null;
      for (const name of ['listing/titleOrdered/v1', 'listing/titleOrdered/v0']) {
        const i = await this.findUrl('X', name);
        if (i < 0) continue;
        const b = await this.blob(await this.follow(i));
        return new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)));
      }
      throw new Error('This ZIM file has no title index.');
    })());
  }
  private async titleIndex(i: number): Promise<number> {
    const list = await this.titleList();
    if (list) return list[i];
    const b = await this.read(this.h.titlePtr + i * 4, 4);
    return new DataView(b.buffer, b.byteOffset).getUint32(0, true);
  }
  /** Number of entries in the title order. */
  private async titleCount(): Promise<number> {
    return (await this.titleList())?.length ?? this.h.entries;
  }
}

interface Header { major: number; minor: number; entries: number; clusters: number; urlPtr: number; titlePtr: number; clusterPtr: number; mimePtr: number; mainPage: number; checksum: number }
interface Dirent { redirect: boolean; target: number; cluster: number; blob: number; ns: string; mime: number; url: string; title: string }

/** Article HTML -> readable text (scripts, styles, navigation and infoboxes removed). */
export function htmlToText(html: string, max: number): string {
  const doc = new DOMParser().parseFromString(html.length > 600_000 ? html.slice(0, 600_000) : html, 'text/html');
  doc.querySelectorAll('script,style,nav,footer,noscript,table.infobox,.navbox,.mw-editsection,sup.reference').forEach((n) => n.remove());
  const blocks: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) { blocks.push(n.textContent ?? ''); return; }
    const el = n as Element;
    const block = /^(P|DIV|H[1-6]|LI|TR|BR|SECTION|UL|OL|TABLE|BLOCKQUOTE)$/.test(el.tagName ?? '');
    if (block) blocks.push('\n');
    n.childNodes.forEach(walk);
    if (block) blocks.push('\n');
  };
  walk(doc.body ?? doc);
  const text = blocks.join('').replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > max ? text.slice(0, max) + '...' : text;
}
