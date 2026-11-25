// FsBackend over the Windows app's real disk (window.atlasHost.fsRaw, implemented in desktop/lib/diskfs.cjs).
import type { FsBackend, FsStat, FsWriter } from './fs';
import { norm } from './fs';

interface Raw {
  read(p: string): Promise<Uint8Array>; readRange(p: string, pos: number, len: number): Promise<Uint8Array>;
  write(p: string, d: Uint8Array | string): Promise<void>; append(p: string, d: Uint8Array | string): Promise<void>;
  stat(p: string): Promise<FsStat>; exists(p: string): Promise<boolean>; mkdir(p: string): Promise<void>; readdir(p: string): Promise<FsStat[]>;
  unlink(p: string): Promise<void>; move(a: string, b: string): Promise<void>; copy(a: string, b: string): Promise<void>;
  hash(p: string, algo: string): Promise<string>;
  writerOpen(p: string, keep: boolean): Promise<number>; writerWrite(id: number, c: Uint8Array): Promise<void>; writerClose(id: number): Promise<void>;
  usage(): Promise<{ used: number; quota: number }>; fileUrl(p: string): string;
}

export class DesktopFs implements FsBackend {
  readonly kind = 'disk' as const;
  constructor(private raw: Raw) {}
  readFile = (p: string) => this.raw.read(norm(p));
  readRange = (p: string, pos: number, len: number) => this.raw.readRange(norm(p), pos, len);
  writeFile = async (p: string, d: Uint8Array | Blob | string) => this.raw.write(norm(p), d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : d);
  appendFile = (p: string, d: Uint8Array | string) => this.raw.append(norm(p), d);
  stat = (p: string) => this.raw.stat(norm(p));
  exists = (p: string) => this.raw.exists(norm(p));
  mkdir = (p: string) => this.raw.mkdir(norm(p));
  readdir = (p: string) => this.raw.readdir(norm(p));
  unlink = (p: string) => this.raw.unlink(norm(p));
  move = (a: string, b: string) => this.raw.move(norm(a), norm(b));
  copy = (a: string, b: string) => this.raw.copy(norm(a), norm(b));
  hash = (p: string, algo: string) => this.raw.hash(norm(p), algo);
  fileUrl = (p: string) => this.raw.fileUrl(norm(p));
  usage = () => this.raw.usage();
  async getFile(p: string): Promise<File> {
    // Streamed from disk through the atlas-file:// protocol; nothing is read until the caller reads it.
    const res = await fetch(this.raw.fileUrl(norm(p)));
    if (!res.ok) throw Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' });
    const blob = await res.blob();
    return new File([blob], norm(p).split('/').pop() || 'file', { type: blob.type });
  }
  async openWriter(p: string, keep = false): Promise<FsWriter> {
    const id = await this.raw.writerOpen(norm(p), keep);
    return { write: (c) => this.raw.writerWrite(id, c), close: () => this.raw.writerClose(id), abort: () => this.raw.writerClose(id) };
  }
}
