// Dedicated worker that writes OPFS files with synchronous access handles. Used where FileSystemFileHandle.createWritable
// does not exist (Safari / iOS before 26): the main thread cannot use sync handles, a worker can.
/// <reference lib="webworker" />
const root = () => (self as any).navigator.storage.getDirectory() as Promise<FileSystemDirectoryHandle>;
const parts = (p: string) => p.split('/').filter(Boolean);
async function fileHandle(path: string): Promise<FileSystemFileHandle> {
  const segs = parts(path);
  let dir = await root();
  for (const s of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(s, { create: true });
  return dir.getFileHandle(segs[segs.length - 1], { create: true });
}
const handles = new Map<number, any>();
const offsets = new Map<number, number>();
let seq = 1;

self.onmessage = async (e: MessageEvent) => {
  const { id, op, path, data, keep, handle } = e.data as { id: number; op: string; path?: string; data?: ArrayBuffer; keep?: boolean; handle?: number };
  try {
    let result: unknown = true;
    if (op === 'open') {
      const h: any = await (await fileHandle(path!)).createSyncAccessHandle();
      if (!keep) h.truncate(0);
      const n = seq++;
      handles.set(n, h);
      offsets.set(n, keep ? h.getSize() : 0);
      result = n;
    } else if (op === 'write') {
      const h = handles.get(handle!);
      const at = offsets.get(handle!)!;
      const buf = new Uint8Array(data!);
      h.write(buf, { at });
      offsets.set(handle!, at + buf.length);
    } else if (op === 'close') {
      const h = handles.get(handle!);
      if (h) { h.flush(); h.close(); }
      handles.delete(handle!); offsets.delete(handle!);
    }
    (self as any).postMessage({ id, result });
  } catch (err: any) {
    (self as any).postMessage({ id, error: String(err?.message ?? err) });
  }
};
