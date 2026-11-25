// Getting files into and out of the virtual file system: pick (open dialog), save (download / save dialog).
import { fs, baseName, dirName } from './fs';

const CACHE = '/atlas/cache/picked';
const uid = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2)).slice(0, 8);

export interface PickedFile {
  uri: string;
  name: string;
  type: string | null;
  size: number;
  path: string;
}

export interface PickRequest {
  accept?: string[]; // MIME types or extensions
  multiple?: boolean;
  directory?: boolean;
  capture?: 'environment' | 'user';
}

/** Open the platform file chooser. In the Windows app this is the native dialog (host.pickFiles). */
export async function pickFiles(req: PickRequest): Promise<PickedFile[]> {
  const host = (globalThis as any).atlasHost;
  let files: File[];
  if (host?.pickFiles) {
    const res = (await host.pickFiles(req)) as { path: string; name: string; size: number; type: string | null }[] | null;
    if (!res?.length) throw Object.assign(new Error('User canceled'), { code: 'OPERATION_CANCELED' });
    return res.map((r) => ({ uri: `file://${r.path}`, name: r.name, type: r.type, size: r.size, path: r.path }));
  }
  files = await new Promise<File[]>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !!req.multiple;
    if (req.accept?.length && !req.accept.includes('*/*')) input.accept = req.accept.join(',');
    if (req.capture) input.setAttribute('capture', req.capture);
    if (req.directory) (input as any).webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      reject(Object.assign(new Error('User canceled'), { code: 'OPERATION_CANCELED' }));
      input.remove();
    });
    input.click();
  });
  const out: PickedFile[] = [];
  const backend = fs();
  await backend.mkdir(CACHE);
  for (const f of files) {
    const rel = (f as any).webkitRelativePath as string | undefined;
    const path = `${CACHE}/${uid()}/${rel || f.name}`;
    await backend.mkdir(dirName(path));
    const w = await backend.openWriter(path);
    const reader = f.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await w.write(value);
    }
    await w.close();
    out.push({ uri: `file://${path}`, name: f.name, type: f.type || null, size: f.size, path });
  }
  if (!out.length) throw Object.assign(new Error('User canceled'), { code: 'OPERATION_CANCELED' });
  return out;
}

/** Hand a file from the virtual FS to the user (browser download / native save dialog). */
export async function saveToUser(path: string, fileName: string, mimeType?: string): Promise<string> {
  const host = (globalThis as any).atlasHost;
  if (host?.saveFile) {
    const dest = await host.saveFile({ path, fileName });
    if (!dest) throw Object.assign(new Error('User canceled'), { code: 'OPERATION_CANCELED' });
    return `file://${dest}`;
  }
  const file = await fs().getFile(path);
  const blob = new Blob([file], { type: mimeType || file.type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || baseName(path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return `file://${path}`;
}

const urlCache = new Map<string, string>();
/** A URL the browser can load for a virtual file (images, audio, pdf). Cached per path. */
export async function blobUrlFor(path: string): Promise<string> {
  const key = path;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const file = await fs().getFile(path);
  const url = URL.createObjectURL(file);
  urlCache.set(key, url);
  return url;
}
export function forgetBlobUrl(path: string) {
  const u = urlCache.get(path);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(path);
}
