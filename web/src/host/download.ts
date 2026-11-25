// Streaming downloads straight into the virtual file system (OPFS / disk). Shared by RNFS.downloadFile
// and the DownloadManagerModule web implementation. Supports resume (Range), progress, cancel.
import { fs, norm } from './fs';

export interface DownloadOptions {
  url: string;
  toFile: string;
  headers?: Record<string, string>;
  /** Append to an existing partial file (HTTP Range resume). */
  resume?: boolean;
  onBegin?: (info: { statusCode: number; contentLength: number; headers: Record<string, string> }) => void;
  onProgress?: (p: { bytesWritten: number; contentLength: number }) => void;
  progressIntervalMs?: number;
  signal?: AbortSignal;
}

export interface DownloadResult {
  statusCode: number;
  bytesWritten: number;
}

export async function downloadToFile(opts: DownloadOptions): Promise<DownloadResult> {
  const backend = fs();
  const to = norm(opts.toFile);
  let existing = 0;
  if (opts.resume) {
    try {
      existing = (await backend.stat(to)).size;
    } catch {
      existing = 0;
    }
  }
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (existing > 0) headers.Range = `bytes=${existing}-`;
  const res = await fetch(opts.url, { headers, signal: opts.signal, redirect: 'follow' });
  if (!(res.status >= 200 && res.status < 300)) {
    return { statusCode: res.status, bytesWritten: 0 };
  }
  const resumed = existing > 0 && res.status === 206;
  const len = Number(res.headers.get('content-length') ?? 0);
  const total = resumed ? existing + len : len;
  const hdrs: Record<string, string> = {};
  res.headers.forEach((v, k) => (hdrs[k] = v));
  opts.onBegin?.({ statusCode: res.status, contentLength: total, headers: hdrs });
  const writer = await backend.openWriter(to, resumed);
  let written = resumed ? existing : 0;
  let last = 0;
  const every = opts.progressIntervalMs ?? 250;
  try {
    if (!res.body) {
      const buf = new Uint8Array(await res.arrayBuffer());
      await writer.write(buf);
      written += buf.length;
    } else {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
        written += value.length;
        const now = Date.now();
        if (now - last >= every) {
          last = now;
          opts.onProgress?.({ bytesWritten: written, contentLength: total || written });
        }
      }
    }
    await writer.close();
  } catch (e) {
    // Keep the partial file when the caller may resume; an abort leaves it on disk on purpose.
    await writer.close().catch(() => undefined);
    throw e;
  }
  opts.onProgress?.({ bytesWritten: written, contentLength: total || written });
  return { statusCode: res.status, bytesWritten: written - (resumed ? existing : 0) };
}
