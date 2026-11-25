// Virtual file system contract. The app sees POSIX-style absolute paths (RNFS.DocumentDirectoryPath etc).
// Browser: backed by the Origin Private File System. Windows app: window.atlasHost.fs (real disk).
export interface FsStat {
  path: string;
  name: string;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  mtime: number;
  ctime: number;
}

export interface FsBackend {
  readonly kind: 'opfs' | 'memory' | 'disk';
  /** Optional fast paths: a hash computed where the file lives, and a URL a browser element can load directly. */
  hash?(path: string, algo: string): Promise<string>;
  fileUrl?(path: string): string;
  readFile(path: string): Promise<Uint8Array>;
  /** Read a byte range (position, length) without loading the whole file. */
  readRange(path: string, position: number, length: number): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | Blob | string): Promise<void>;
  appendFile(path: string, data: Uint8Array | string): Promise<void>;
  stat(path: string): Promise<FsStat>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<FsStat[]>;
  unlink(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  /** A File handle for big files: streamed into WASM / blob URLs without copying into memory. */
  getFile(path: string): Promise<File>;
  /** Open a sequential writer (downloads). `keep` appends to what is on disk (resume). */
  openWriter(path: string, keep?: boolean): Promise<FsWriter>;
  usage(): Promise<{ used: number; quota: number }>;
}

export interface FsWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export const norm = (p: string): string => {
  let s = p.replace(/^file:\/\//, '').replace(/\\/g, '/');
  try {
    s = decodeURI(s);
  } catch {
    /* keep raw */
  }
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
};
export const baseName = (p: string) => norm(p).split('/').pop() || '';
export const dirName = (p: string) => {
  const n = norm(p);
  return n.slice(0, n.lastIndexOf('/')) || '/';
};

const enc = new TextEncoder();
export const toBytes = async (d: Uint8Array | Blob | string): Promise<Uint8Array> =>
  typeof d === 'string' ? enc.encode(d) : d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : d;

import { DesktopFs } from './desktopFs';

// ---------------------------------------------------------------------------------------------
// OPFS implementation
// ---------------------------------------------------------------------------------------------
class OpfsFs implements FsBackend {
  readonly kind = 'opfs' as const;
  private rootP: Promise<FileSystemDirectoryHandle> | null = null;
  private root() {
    return (this.rootP ??= navigator.storage.getDirectory());
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let cur = await this.root();
    for (const seg of norm(path).split('/').filter(Boolean)) cur = await cur.getDirectoryHandle(seg, { create });
    return cur;
  }
  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const p = norm(path);
    const d = await this.dir(dirName(p), create);
    return d.getFileHandle(baseName(p), { create });
  }
  private notFound(path: string): Error {
    const e: any = new Error(`ENOENT: no such file or directory, open '${path}'`);
    e.code = 'ENOENT';
    return e;
  }

  async readFile(path: string) {
    try {
      const f = await (await this.fileHandle(path)).getFile();
      return new Uint8Array(await f.arrayBuffer());
    } catch (e: any) {
      if (e?.name === 'NotFoundError' || e?.name === 'TypeMismatchError') throw this.notFound(path);
      throw e;
    }
  }
  async readRange(path: string, position: number, length: number) {
    try {
      const f = await (await this.fileHandle(path)).getFile();
      return new Uint8Array(await f.slice(position, position + length).arrayBuffer());
    } catch (e: any) {
      if (e?.name === 'NotFoundError') throw this.notFound(path);
      throw e;
    }
  }
  async writeFile(path: string, data: Uint8Array | Blob | string) {
    const h = await this.fileHandle(path, true);
    const w = await (h as any).createWritable();
    await w.write(data as any);
    await w.close();
  }
  async appendFile(path: string, data: Uint8Array | string) {
    const h = await this.fileHandle(path, true);
    const size = (await h.getFile()).size;
    const w = await (h as any).createWritable({ keepExistingData: true });
    await w.seek(size);
    await w.write(data as any);
    await w.close();
  }
  private toStat(path: string, name: string, kind: 'file' | 'directory', f?: File): FsStat {
    return {
      path: norm(path),
      name,
      size: f?.size ?? 0,
      isFile: kind === 'file',
      isDirectory: kind === 'directory',
      mtime: f?.lastModified ?? 0,
      ctime: f?.lastModified ?? 0,
    };
  }
  async stat(path: string) {
    const p = norm(path);
    if (p === '/') return this.toStat(p, '', 'directory');
    try {
      const f = await (await this.fileHandle(p)).getFile();
      return this.toStat(p, baseName(p), 'file', f);
    } catch (e: any) {
      if (e?.name === 'NotFoundError' || e?.name === 'TypeMismatchError') {
        try {
          await this.dir(p, false);
          return this.toStat(p, baseName(p), 'directory');
        } catch {
          throw this.notFound(path);
        }
      }
      throw e;
    }
  }
  async exists(path: string) {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }
  async mkdir(path: string) {
    await this.dir(path, true);
  }
  async readdir(path: string) {
    const d = await this.dir(path, false).catch(() => {
      throw this.notFound(path);
    });
    const out: FsStat[] = [];
    for await (const [name, h] of (d as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      const child = norm(path) + (norm(path) === '/' ? '' : '/') + name;
      if (h.kind === 'file') out.push(this.toStat(child, name, 'file', await (h as FileSystemFileHandle).getFile()));
      else out.push(this.toStat(child, name, 'directory'));
    }
    return out;
  }
  async unlink(path: string) {
    const p = norm(path);
    if (p === '/') return;
    const parent = await this.dir(dirName(p), false).catch(() => null);
    if (!parent) return;
    try {
      await (parent as any).removeEntry(baseName(p), { recursive: true });
    } catch (e: any) {
      if (e?.name !== 'NotFoundError') throw e;
    }
  }
  async getFile(path: string) {
    try {
      return await (await this.fileHandle(path)).getFile();
    } catch (e: any) {
      if (e?.name === 'NotFoundError') throw this.notFound(path);
      throw e;
    }
  }
  async copy(from: string, to: string) {
    const st = await this.stat(from);
    if (st.isDirectory) {
      await this.mkdir(to);
      for (const c of await this.readdir(from)) await this.copy(c.path, norm(to) + '/' + c.name);
      return;
    }
    await this.writeFile(to, await this.getFile(from));
  }
  async move(from: string, to: string) {
    const h: any = await this.fileHandle(from).catch(() => null);
    if (h && typeof h.move === 'function') {
      try {
        const d = await this.dir(dirName(to), true);
        await h.move(d, baseName(to));
        return;
      } catch {
        /* fall back to copy + delete */
      }
    }
    await this.copy(from, to);
    await this.unlink(from);
  }
  async openWriter(path: string, keep = false): Promise<FsWriter> {
    const h = await this.fileHandle(path, true);
    const size = keep ? (await h.getFile()).size : 0;
    const w = await (h as any).createWritable({ keepExistingData: keep });
    if (keep) await w.seek(size);
    return {
      write: (chunk) => w.write(chunk),
      close: () => w.close(),
      abort: () => w.abort().catch(() => undefined),
    };
  }
  async usage() {
    const e = await navigator.storage.estimate();
    return { used: e.usage ?? 0, quota: e.quota ?? 0 };
  }
}

// ---------------------------------------------------------------------------------------------
// In-memory fallback (private windows or browsers without OPFS). Nothing survives a reload.
// ---------------------------------------------------------------------------------------------
class MemoryFs implements FsBackend {
  readonly kind = 'memory' as const;
  private files = new Map<string, { data: Uint8Array; mtime: number }>();
  private dirs = new Set<string>(['/']);
  private mkp(p: string) {
    let cur = '';
    for (const s of norm(p).split('/').filter(Boolean)) {
      cur += '/' + s;
      this.dirs.add(cur);
    }
  }
  private nf(path: string) {
    const e: any = new Error(`ENOENT: no such file or directory, open '${path}'`);
    e.code = 'ENOENT';
    return e;
  }
  async readFile(path: string) {
    const f = this.files.get(norm(path));
    if (!f) throw this.nf(path);
    return f.data;
  }
  async readRange(path: string, pos: number, len: number) {
    return (await this.readFile(path)).slice(pos, pos + len);
  }
  async writeFile(path: string, data: Uint8Array | Blob | string) {
    this.mkp(dirName(path));
    this.files.set(norm(path), { data: await toBytes(data), mtime: Date.now() });
  }
  async appendFile(path: string, data: Uint8Array | string) {
    const cur = this.files.get(norm(path))?.data ?? new Uint8Array();
    const add = await toBytes(data);
    const merged = new Uint8Array(cur.length + add.length);
    merged.set(cur);
    merged.set(add, cur.length);
    await this.writeFile(path, merged);
  }
  async stat(path: string): Promise<FsStat> {
    const p = norm(path);
    const f = this.files.get(p);
    if (f) return { path: p, name: baseName(p), size: f.data.length, isFile: true, isDirectory: false, mtime: f.mtime, ctime: f.mtime };
    if (this.dirs.has(p)) return { path: p, name: baseName(p), size: 0, isFile: false, isDirectory: true, mtime: 0, ctime: 0 };
    throw this.nf(path);
  }
  async exists(path: string) {
    return this.files.has(norm(path)) || this.dirs.has(norm(path));
  }
  async mkdir(path: string) {
    this.mkp(path);
  }
  async readdir(path: string) {
    const p = norm(path);
    if (!this.dirs.has(p)) throw this.nf(path);
    const prefix = p === '/' ? '/' : p + '/';
    const names = new Set<string>();
    for (const k of [...this.files.keys(), ...this.dirs]) if (k.startsWith(prefix) && k !== p) names.add(k.slice(prefix.length).split('/')[0]);
    return Promise.all([...names].map((n) => this.stat(prefix + n)));
  }
  async unlink(path: string) {
    const p = norm(path);
    for (const k of [...this.files.keys()]) if (k === p || k.startsWith(p + '/')) this.files.delete(k);
    for (const k of [...this.dirs]) if (k === p || k.startsWith(p + '/')) this.dirs.delete(k);
  }
  async move(from: string, to: string) {
    await this.copy(from, to);
    await this.unlink(from);
  }
  async copy(from: string, to: string) {
    const f = norm(from);
    for (const [k, v] of [...this.files]) if (k === f || k.startsWith(f + '/')) await this.writeFile(norm(to) + k.slice(f.length), v.data.slice());
    if (this.dirs.has(f)) this.mkp(to);
  }
  async getFile(path: string) {
    return new File([(await this.readFile(path)) as BlobPart], baseName(path));
  }
  async openWriter(path: string, keep = false): Promise<FsWriter> {
    const parts: Uint8Array[] = [];
    if (keep && this.files.has(norm(path))) parts.push(this.files.get(norm(path))!.data);
    return {
      write: async (c) => void parts.push(c.slice()),
      close: async () => this.writeFile(path, new Blob(parts as BlobPart[])),
      abort: async () => undefined,
    };
  }
  async usage() {
    let used = 0;
    for (const f of this.files.values()) used += f.data.length;
    return { used, quota: 2 * 1024 ** 3 };
  }
}

let backend: FsBackend | null = null;
export function setFsBackend(b: FsBackend) {
  backend = b;
}
export function fs(): FsBackend {
  if (backend) return backend;
  const raw = (globalThis as any).atlasHost?.fsRaw;
  if (raw) return (backend = new DesktopFs(raw));
  backend = typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory ? new OpfsFs() : new MemoryFs();
  return backend;
}
