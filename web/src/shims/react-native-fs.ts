// react-native-fs on the web: the same API over the virtual file system (OPFS in browsers,
// real disk in the Windows app). Paths are POSIX style; file:// prefixes are accepted.
import { sha256 } from 'js-sha256';
import { fs, norm, baseName, dirName, toBytes, type FsStat } from '../host/fs';
import { downloadToFile } from '../host/download';

const ROOT = '/atlas';
export const DocumentDirectoryPath = `${ROOT}/files`;
export const CachesDirectoryPath = `${ROOT}/cache`;
export const TemporaryDirectoryPath = `${ROOT}/tmp`;
export const ExternalDirectoryPath = `${ROOT}/external`;
export const ExternalStorageDirectoryPath = `${ROOT}/storage`;
export const ExternalCachesDirectoryPath = `${ROOT}/external-cache`;
export const DownloadDirectoryPath = `${ROOT}/downloads`;
export const PicturesDirectoryPath = `${ROOT}/pictures`;
export const MainBundlePath = `${ROOT}/bundle`;
export const LibraryDirectoryPath = `${ROOT}/library`;

const b64enc = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const decode = (u: Uint8Array, encoding?: string) =>
  encoding === 'base64' ? b64enc(u) : encoding === 'ascii' ? Array.from(u, (b) => String.fromCharCode(b)).join('') : new TextDecoder().decode(u);
const encode = (data: string, encoding?: string): Uint8Array | string => (encoding === 'base64' ? b64dec(data) : data);

export interface ReadDirItem {
  ctime: Date | null;
  mtime: Date | null;
  name: string;
  path: string;
  size: number;
  isFile: () => boolean;
  isDirectory: () => boolean;
}
export type ReadDirResItemT = ReadDirItem;
export interface StatResult {
  name?: string;
  path: string;
  size: number;
  mode: number;
  ctime: number;
  mtime: number;
  originalFilepath: string;
  isFile: () => boolean;
  isDirectory: () => boolean;
}

const toItem = (s: FsStat): ReadDirItem => ({
  ctime: new Date(s.ctime),
  mtime: new Date(s.mtime),
  name: s.name,
  path: s.path,
  size: s.size,
  isFile: () => s.isFile,
  isDirectory: () => s.isDirectory,
});

let bootstrapped: Promise<void> | null = null;
function boot() {
  return (bootstrapped ??= (async () => {
    for (const d of [DocumentDirectoryPath, CachesDirectoryPath, TemporaryDirectoryPath, ExternalDirectoryPath, DownloadDirectoryPath, ExternalStorageDirectoryPath]) {
      await fs().mkdir(d).catch(() => undefined);
    }
  })());
}

export async function exists(path: string) {
  await boot();
  return fs().exists(path);
}
export async function mkdir(path: string, _opts?: unknown) {
  await boot();
  await fs().mkdir(path);
}
export async function readDir(path: string) {
  await boot();
  return (await fs().readdir(path)).map(toItem);
}
export const readDirAssets = async (_path: string) => [] as ReadDirItem[];
export async function stat(path: string): Promise<StatResult> {
  await boot();
  const s = await fs().stat(path);
  return {
    name: s.name,
    path: s.path,
    size: s.size,
    mode: 0o644,
    ctime: s.ctime,
    mtime: s.mtime,
    originalFilepath: s.path,
    isFile: () => s.isFile,
    isDirectory: () => s.isDirectory,
  };
}
export async function readFile(path: string, encoding?: string) {
  await boot();
  return decode(await fs().readFile(path), encoding);
}
export async function writeFile(path: string, content: string, encoding?: string) {
  await boot();
  await fs().mkdir(dirName(path));
  await fs().writeFile(path, encode(content, encoding) as any);
}
export async function appendFile(path: string, content: string, encoding?: string) {
  await boot();
  await fs().mkdir(dirName(path));
  await fs().appendFile(path, encode(content, encoding) as any);
}
export async function read(path: string, length = 0, position = 0, encoding?: string) {
  await boot();
  const u = length > 0 ? await fs().readRange(path, position, length) : await fs().readFile(path);
  return decode(u, encoding);
}
export async function unlink(path: string) {
  await boot();
  if (!(await fs().exists(path))) {
    const e: any = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    e.code = 'ENOENT';
    throw e;
  }
  await fs().unlink(path);
}
export async function moveFile(from: string, to: string) {
  await boot();
  await fs().mkdir(dirName(to));
  await fs().move(from, to);
}
export async function copyFile(from: string, to: string) {
  await boot();
  await fs().mkdir(dirName(to));
  await fs().copy(from, to);
}
export async function copyFileAssets(assetPath: string, dest: string) {
  const res = await fetch(`${import.meta.env.BASE_URL}android-assets/${assetPath.replace(/^\/+/, '')}`);
  if (!res.ok) throw new Error(`Bundled asset not found: ${assetPath}`);
  await fs().mkdir(dirName(dest));
  await fs().writeFile(dest, new Uint8Array(await res.arrayBuffer()));
}
export const existsAssets = async (assetPath: string) => (await fetch(`${import.meta.env.BASE_URL}android-assets/${assetPath}`, { method: 'HEAD' })).ok;
export async function touch(path: string) {
  if (!(await fs().exists(path))) await fs().writeFile(path, '');
}
export async function getFSInfo() {
  const u = await fs().usage();
  const free = Math.max(0, u.quota - u.used);
  return { totalSpace: u.quota, freeSpace: free, totalSpaceEx: u.quota, freeSpaceEx: free };
}
export async function hash(path: string, algorithm: string) {
  await boot();
  const nativeHash = fs().hash;
  if (nativeHash) return nativeHash.call(fs(), path, algorithm);
  if (algorithm !== 'sha256') {
    const data = await (await fs().getFile(path)).arrayBuffer();
    const name = { sha1: 'SHA-1', sha384: 'SHA-384', sha512: 'SHA-512' }[algorithm as 'sha1'];
    if (!name) throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    const d = new Uint8Array(await crypto.subtle.digest(name, data));
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const file = await fs().getFile(path);
  const h = sha256.create();
  const CH = 16 * 1024 * 1024;
  for (let pos = 0; pos < file.size; pos += CH) h.update(new Uint8Array(await file.slice(pos, pos + CH).arrayBuffer()));
  return h.hex();
}

const jobs = new Map<number, AbortController>();
let jobSeq = 1;
export function downloadFile(opts: {
  fromUrl: string;
  toFile: string;
  headers?: Record<string, string>;
  begin?: (r: { statusCode: number; contentLength: number; headers: Record<string, string> }) => void;
  progress?: (r: { contentLength: number; bytesWritten: number; jobId?: number }) => void;
  progressInterval?: number;
  background?: boolean;
  resumable?: () => void;
}) {
  const jobId = jobSeq++;
  const ctl = new AbortController();
  jobs.set(jobId, ctl);
  const promise = (async () => {
    await boot();
    try {
      await fs().mkdir(dirName(opts.toFile));
      const r = await downloadToFile({
        url: opts.fromUrl,
        toFile: opts.toFile,
        headers: opts.headers,
        signal: ctl.signal,
        progressIntervalMs: opts.progressInterval,
        onBegin: opts.begin,
        onProgress: (p) => opts.progress?.({ ...p, jobId }),
      });
      if (r.statusCode >= 400) throw new Error(`Download failed: HTTP ${r.statusCode}`);
      return { jobId, statusCode: r.statusCode, bytesWritten: r.bytesWritten };
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('Download has been aborted');
      throw e;
    } finally {
      jobs.delete(jobId);
    }
  })();
  return { jobId, promise };
}
export function stopDownload(jobId: number) {
  jobs.get(jobId)?.abort();
}
export const isResumable = async () => true;
export const resumeDownload = () => undefined;
export const pauseDownload = () => undefined;
export const completeHandlerIOS = () => undefined;
export const pathForBundle = (n: string) => `${MainBundlePath}/${n}`;
export const pathForGroup = (n: string) => `${ROOT}/${n}`;
export const scanFile = async () => [];
export const getAllExternalFilesDirs = async () => [ExternalDirectoryPath];
export const uploadFiles = () => ({ jobId: 0, promise: Promise.reject(new Error('Upload is not available on the web build')) });
export const stopUpload = () => undefined;
export const readFileAssets = async (p: string, enc?: string) => {
  const r = await fetch(`${import.meta.env.BASE_URL}android-assets/${p}`);
  return decode(new Uint8Array(await r.arrayBuffer()), enc);
};

const RNFS = {
  DocumentDirectoryPath, CachesDirectoryPath, TemporaryDirectoryPath, ExternalDirectoryPath, ExternalStorageDirectoryPath,
  ExternalCachesDirectoryPath, DownloadDirectoryPath, PicturesDirectoryPath, MainBundlePath, LibraryDirectoryPath,
  exists, mkdir, readDir, readDirAssets, stat, readFile, writeFile, appendFile, read, unlink, moveFile, copyFile,
  copyFileAssets, existsAssets, touch, getFSInfo, hash, downloadFile, stopDownload, isResumable, resumeDownload,
  pauseDownload, completeHandlerIOS, pathForBundle, pathForGroup, scanFile, getAllExternalFilesDirs, uploadFiles,
  stopUpload, readFileAssets,
};
export { norm as _norm, baseName as _baseName, toBytes as _toBytes };
export default RNFS;
