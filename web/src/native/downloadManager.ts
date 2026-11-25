// DownloadManagerModule for the web / desktop builds. Same contract as the Android module:
// startDownload -> events DownloadProgress / DownloadComplete / DownloadError, rows that survive an app
// restart (partial files are resumed with HTTP Range), retry with back-off, cancel, move-when-done.
import { bus, registerNativeModule } from './registry';
import { fs, norm, baseName, dirName } from '../host/fs';
import { downloadToFile } from '../host/download';
import { hash as sha256File } from '../shims/react-native-fs';

type Status = 'pending' | 'running' | 'retrying' | 'waiting_for_network' | 'completed' | 'failed' | 'cancelled';
interface Row {
  downloadId: string;
  url: string;
  fileName: string;
  modelId: string;
  modelKey?: string;
  modelType?: string;
  quantization?: string;
  combinedTotalBytes?: number;
  mmProjDownloadId?: string;
  metadataJson?: string;
  totalBytes: number;
  bytesDownloaded: number;
  sha256?: string;
  status: Status;
  reason?: string;
  reasonCode?: string;
  localUri?: string;
  createdAt: number;
}

const KEY = 'atlas.downloads.v1';
const DIR = '/atlas/downloads';
const rows = new Map<string, Row>();
const ctl = new Map<string, AbortController>();
let loaded = false;

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...rows.values()]));
  } catch { /* storage full: rows are re-derived from partial files */ }
};
const load = () => {
  if (loaded) return;
  loaded = true;
  try {
    for (const r of JSON.parse(localStorage.getItem(KEY) ?? '[]') as Row[]) rows.set(r.downloadId, r);
  } catch { /* ignore */ }
};
const pathFor = (r: Row) => `${DIR}/${r.downloadId}-${r.fileName.replace(/[^\w.\-]+/g, '_')}`;
const emitProgress = (r: Row) =>
  bus.emit('DownloadProgress', { downloadId: r.downloadId, fileName: r.fileName, modelId: r.modelId, bytesDownloaded: r.bytesDownloaded, totalBytes: r.totalBytes, status: r.status, reason: r.reason, reasonCode: r.reasonCode });

function codeForStatus(status: number): string {
  if ([401, 403, 404, 416, 429].includes(status)) return `http_${status}`;
  if (status >= 500) return 'server_unavailable';
  if (status >= 400) return 'client_error';
  return 'unknown_error';
}

let wakeLock: any = null;
async function holdAwake(on: boolean) {
  try {
    if (on && !wakeLock && (navigator as any).wakeLock) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not allowed (background tab) */ }
}
const anyRunning = () => [...rows.values()].some((r) => r.status === 'running' || r.status === 'retrying');

async function run(r: Row, attempt = 0): Promise<void> {
  if (ctl.has(r.downloadId)) return;
  const abort = new AbortController();
  ctl.set(r.downloadId, abort);
  r.status = attempt ? 'retrying' : 'running';
  r.reason = undefined;
  r.reasonCode = undefined;
  persist();
  emitProgress(r);
  void holdAwake(true);
  try {
    await fs().mkdir(DIR);
    const to = pathFor(r);
    // Ask for persistent storage once: a multi-GB model must not be evicted under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
    const free = await fs().usage();
    const need = Math.max(0, (r.totalBytes || 0) - r.bytesDownloaded);
    if (free.quota && need && free.quota - free.used < need) {
      throw Object.assign(new Error('Not enough storage space'), { code: 'disk_full' });
    }
    const res = await downloadToFile({
      url: r.url,
      toFile: to,
      resume: true,
      signal: abort.signal,
      progressIntervalMs: 400,
      onBegin: (b) => {
        if (b.contentLength > 0) r.totalBytes = b.contentLength;
      },
      onProgress: (p) => {
        r.bytesDownloaded = p.bytesWritten;
        if (p.contentLength > r.totalBytes) r.totalBytes = p.contentLength;
        r.status = 'running';
        emitProgress(r);
      },
    });
    if (res.statusCode === 416) {
      // Range not satisfiable: the partial file is already the whole file.
      r.bytesDownloaded = (await fs().stat(to)).size;
    } else if (res.statusCode >= 400) {
      throw Object.assign(new Error(`HTTP ${res.statusCode}`), { code: codeForStatus(res.statusCode), http: res.statusCode });
    }
    const size = (await fs().stat(to)).size;
    if (size === 0) throw Object.assign(new Error('Empty response'), { code: 'empty_response' });
    if (r.sha256) {
      const got = await sha256File(to, 'sha256');
      if (got.toLowerCase() !== r.sha256.toLowerCase()) {
        await fs().unlink(to).catch(() => undefined);
        r.bytesDownloaded = 0;
        throw Object.assign(new Error('Checksum does not match the published file'), { code: 'file_corrupted' });
      }
    }
    r.bytesDownloaded = size;
    r.totalBytes = r.totalBytes || size;
    r.status = 'completed';
    r.localUri = `file://${to}`;
    persist();
    bus.emit('DownloadComplete', { downloadId: r.downloadId, fileName: r.fileName, modelId: r.modelId, bytesDownloaded: size, totalBytes: r.totalBytes, status: 'completed', localUri: r.localUri });
  } catch (e: any) {
    if (abort.signal.aborted || e?.name === 'AbortError') {
      if ((r.status as Status) !== 'cancelled') {
        // paused by app unload / network: keep the partial file, stay resumable
        r.status = 'failed';
        r.reasonCode = 'download_interrupted';
      }
    } else if (!navigator.onLine) {
      r.status = 'waiting_for_network';
      r.reasonCode = 'network_lost';
      r.reason = 'Waiting for network';
      persist();
      emitProgress(r);
    } else if (!e?.code && attempt < 4) {
      ctl.delete(r.downloadId);
      await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt));
      if (rows.get(r.downloadId)?.status === 'cancelled') return;
      return run(r, attempt + 1);
    } else {
      r.status = 'failed';
      r.reasonCode = e?.code ?? (e instanceof TypeError ? 'network_lost' : 'unknown_error');
      r.reason = String(e?.message ?? e);
      persist();
      bus.emit('DownloadError', { downloadId: r.downloadId, fileName: r.fileName, modelId: r.modelId, status: 'failed', reason: r.reason, reasonCode: r.reasonCode });
    }
  } finally {
    ctl.delete(r.downloadId);
    persist();
    if (!anyRunning()) void holdAwake(false);
  }
}

function install() {
  load();
  window.addEventListener('online', () => {
    for (const r of rows.values()) if (r.status === 'waiting_for_network' || (r.status === 'failed' && r.reasonCode === 'network_lost')) void run(r);
  });
  // A reload killed the fetch: pick the partial files back up (same as Android resuming after an app kill).
  setTimeout(() => {
    for (const r of rows.values()) if (r.status === 'running' || r.status === 'pending' || r.status === 'retrying') void run(r);
  }, 1500);
}

registerNativeModule('DownloadManagerModule', {
  async startDownload(p: any) {
    load();
    const id = `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const r: Row = {
      downloadId: id, url: p.url, fileName: p.fileName, modelId: p.modelId, modelKey: p.modelKey, modelType: p.modelType ?? 'text',
      quantization: p.quantization, combinedTotalBytes: p.combinedTotalBytes ?? 0, mmProjDownloadId: p.mmProjDownloadId, metadataJson: p.metadataJson,
      totalBytes: p.totalBytes ?? 0, bytesDownloaded: 0, sha256: p.sha256, status: 'pending', createdAt: Date.now(),
    };
    rows.set(id, r);
    persist();
    void run(r);
    return { downloadId: id, fileName: r.fileName, modelId: r.modelId };
  },
  async cancelDownload(id: string) {
    const r = rows.get(id);
    if (!r) return;
    r.status = 'cancelled';
    ctl.get(id)?.abort();
    await fs().unlink(pathFor(r)).catch(() => undefined);
    rows.delete(id);
    persist();
  },
  async retryDownload(id: string) {
    const r = rows.get(id);
    if (!r) throw new Error('Unknown download');
    r.status = 'pending';
    void run(r);
  },
  async getActiveDownloads() {
    load();
    return [...rows.values()].filter((r) => r.status !== 'cancelled');
  },
  async moveCompletedDownload(id: string, target: string) {
    const r = rows.get(id);
    if (!r) throw new Error('Unknown download');
    const from = pathFor(r);
    const to = norm(target);
    await fs().mkdir(dirName(to));
    if (norm(from) !== to) await fs().move(from, to);
    rows.delete(id);
    persist();
    return to;
  },
  startProgressPolling() {
    for (const r of rows.values()) if (r.status !== 'completed') emitProgress(r);
  },
  stopProgressPolling() {},
  updateCombinedProgress() {},
  async excludePathFromBackup() { return true; },
  async isBatteryOptimizationIgnored() { return true; },
  requestBatteryOptimizationIgnore() {},
  requestNotificationPermission() {
    try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* optional */ }
  },
});
install();
void baseName;
