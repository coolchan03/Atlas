/** Text model download provider: listing, cancel, retry on both platforms, remove, re-issue and relaunch recovery. */
jest.mock('../../../src/services/modelManager', () => ({
  modelManager: {
    cancelBackgroundDownload: jest.fn(async () => undefined), deleteModel: jest.fn(async () => undefined), downloadModelBackground: jest.fn(async () => ({ downloadId: 'dl-new' })),
    watchDownload: jest.fn(), getDownloadedModels: jest.fn(async () => []), resetMmProjForRetry: jest.fn(),
  },
}));
jest.mock('../../../src/services/backgroundDownloadService', () => ({ backgroundDownloadService: { retryDownload: jest.fn(async () => undefined), startProgressPolling: jest.fn() } }));
jest.mock('../../../src/services/huggingface', () => ({ huggingFaceService: { getDownloadUrl: (repo: string, file: string) => `https://hf/${repo}/${file}` } }));
jest.mock('../../../src/services/hardware', () => ({ hardwareService: { getModelTotalSize: (m: { fileSize: number }) => m.fileSize } }));
jest.mock('../../../src/services/startModelDownload', () => ({ startModelDownload: jest.fn(async () => undefined) }));
jest.mock('../../../src/utils/logger', () => ({ __esModule: true, default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { Platform } from 'react-native';
import { textProvider } from '../../../src/services/modelDownloadService/providers/textProvider';
import { useDownloadStore } from '../../../src/stores/downloadStore';
import { useAppStore } from '../../../src/stores';
import { modelManager } from '../../../src/services/modelManager';
import { backgroundDownloadService } from '../../../src/services/backgroundDownloadService';
import { startModelDownload } from '../../../src/services/startModelDownload';

const mm = modelManager as unknown as Record<string, jest.Mock>;
const bg = backgroundDownloadService as unknown as Record<string, jest.Mock>;
const setOS = (os: 'ios' | 'android') => { (Platform as any).OS = os; };
const original = Platform.OS;

const entry = (over: Record<string, unknown> = {}) => ({
  modelKey: 'org/model/file.gguf', downloadId: 'dl-1', modelId: 'org/model', fileName: 'file.gguf', quantization: 'Q4', modelType: 'text',
  status: 'running', bytesDownloaded: 40, totalBytes: 100, combinedTotalBytes: 100, progress: 0.4, createdAt: 1, ...over,
});
const withMmProj = (over: Record<string, unknown> = {}) => entry({
  mmProjDownloadId: 'dl-mm', mmProjFileName: 'mm.gguf', mmProjFileSize: 10, mmProjStatus: 'failed', mmProjBytesDownloaded: 5,
  metadataJson: JSON.stringify({ mmProjDownloadUrl: 'https://hf/mm.gguf' }), ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mm.cancelBackgroundDownload.mockResolvedValue(undefined); mm.deleteModel.mockResolvedValue(undefined);
  mm.downloadModelBackground.mockResolvedValue({ downloadId: 'dl-new' }); mm.getDownloadedModels.mockResolvedValue([]);
  bg.retryDownload.mockResolvedValue(undefined);
  (startModelDownload as jest.Mock).mockResolvedValue(undefined);
  setOS(original as 'ios' | 'android');
  useDownloadStore.setState({ downloads: {}, downloadIdIndex: {} } as never);
  useAppStore.setState({ downloadedModels: [] } as never);
});
afterAll(() => setOS(original as 'ios' | 'android'));

describe('list', () => {
  it('shows in-flight downloads with progress, and finished models once', async () => {
    useDownloadStore.getState().add(entry() as never);
    useAppStore.setState({ downloadedModels: [{ id: 'org/model/file.gguf', fileName: 'file.gguf', filePath: '/m/file.gguf', fileSize: 100 }, { id: 'other/m/o.gguf', fileName: 'o.gguf', filePath: '/m/o.gguf', fileSize: 50 }] } as never);
    const list = await textProvider.list();
    expect(list).toHaveLength(2);
    expect(list.find((d) => d.id === 'text:org/model/file.gguf')).toMatchObject({ status: 'downloading', progress: 0.4 });
    expect(list.find((d) => d.id === 'text:other/m/o.gguf')).toMatchObject({ status: 'completed', filePath: '/m/o.gguf', sizeBytes: 50 });
  });

  it('adds the vision file bytes to the progress of a combined download', async () => {
    useDownloadStore.getState().add(withMmProj() as never);
    expect((await textProvider.list())[0].bytesDownloaded).toBe(45);
  });
});

describe('cancel and remove', () => {
  it('cancels the file and its vision file natively and drops the row, tolerating native failures', async () => {
    useDownloadStore.getState().add(withMmProj() as never);
    mm.cancelBackgroundDownload.mockRejectedValue(new Error('native'));
    await textProvider.cancel('text:org/model/file.gguf');
    expect(mm.cancelBackgroundDownload).toHaveBeenCalledWith('dl-1');
    expect(mm.cancelBackgroundDownload).toHaveBeenCalledWith('dl-mm');
    expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(0);
    await textProvider.cancel('text:nothing');
  });

  it('removes an in-flight download and its file, or a finished model', async () => {
    useDownloadStore.getState().add(withMmProj() as never);
    useAppStore.setState({ downloadedModels: [{ id: 'org/model/file.gguf', fileName: 'f', filePath: '/p', fileSize: 1 }] } as never);
    await textProvider.remove('text:org/model/file.gguf');
    expect(mm.cancelBackgroundDownload).toHaveBeenCalledTimes(2);
    expect(mm.deleteModel).toHaveBeenCalledWith('org/model/file.gguf');
    expect(useAppStore.getState().downloadedModels).toHaveLength(0);
    mm.deleteModel.mockRejectedValueOnce(new Error('gone'));
    await textProvider.remove('text:finished/model.gguf');
    mm.cancelBackgroundDownload.mockRejectedValue(new Error('native'));
    useDownloadStore.getState().add(withMmProj({ modelKey: 'b/m/f.gguf', downloadId: 'dl-b', mmProjDownloadId: 'dl-bm' }) as never);
    await textProvider.remove('text:b/m/f.gguf');
  });
});

describe('retry', () => {
  it('on Android resumes the same job, including a failed vision file, and re-attaches the finisher', async () => {
    setOS('android');
    useDownloadStore.getState().add(withMmProj() as never);
    await textProvider.retry('text:org/model/file.gguf');
    expect(bg.retryDownload).toHaveBeenCalledWith('dl-1');
    expect(bg.retryDownload).toHaveBeenCalledWith('dl-mm');
    expect(mm.resetMmProjForRetry).toHaveBeenCalledWith('dl-1');
    expect(mm.watchDownload).toHaveBeenCalled();
    expect(bg.startProgressPolling).toHaveBeenCalled();
    bg.retryDownload.mockRejectedValueOnce(new Error('x'));
    useDownloadStore.getState().add(withMmProj({ modelKey: 'k2', downloadId: 'dl-2', mmProjDownloadId: 'dl-2m' }) as never);
    await expect(textProvider.retry('text:k2')).rejects.toThrow('x');
  });

  it('on Android does nothing without a live download id, or for an unknown model', async () => {
    setOS('android');
    useDownloadStore.getState().add(entry({ downloadId: '' }) as never);
    await textProvider.retry('text:org/model/file.gguf');
    await textProvider.retry('text:unknown');
    expect(bg.retryDownload).not.toHaveBeenCalled();
  });

  it('on iOS starts again from scratch (with the vision file) and queues the row at once', async () => {
    setOS('ios');
    useDownloadStore.getState().add(withMmProj({ status: 'failed' }) as never);
    await textProvider.retry('text:org/model/file.gguf');
    expect(mm.downloadModelBackground).toHaveBeenCalledWith('org/model', expect.objectContaining({
      name: 'file.gguf', downloadUrl: 'https://hf/org/model/file.gguf', mmProjFile: { name: 'mm.gguf', size: 10, downloadUrl: 'https://hf/mm.gguf' },
    }));
    expect(mm.watchDownload).toHaveBeenCalled();
    useDownloadStore.getState().add(entry({ modelKey: 'plain', downloadId: '', metadataJson: '{bad json' }) as never);
    await textProvider.retry('text:plain');
    expect(mm.downloadModelBackground).toHaveBeenLastCalledWith('org/model', expect.not.objectContaining({ mmProjFile: expect.anything() }));
  });

  it('finishes a re-attached download by refreshing models, and marks it failed on an error', async () => {
    setOS('android');
    useDownloadStore.getState().add(entry() as never);
    await textProvider.retry('text:org/model/file.gguf');
    const [downloadId, onDone, onError] = mm.watchDownload.mock.calls[0];
    mm.getDownloadedModels.mockResolvedValueOnce([{ id: 'org/model/file.gguf', fileName: 'f', filePath: '/p', fileSize: 1 }]);
    await onDone();
    expect(useAppStore.getState().downloadedModels).toHaveLength(1);
    expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(0);
    useDownloadStore.getState().add(entry() as never);
    onError(new Error('disk full'));
    expect(useDownloadStore.getState().downloads['org/model/file.gguf']?.status ?? 'failed').toBe('failed');
    expect(downloadId).toBe('dl-1');
  });
});

describe('re-issue, subscribe and reconcile', () => {
  it('rebuilds a queued download from its saved parameters', async () => {
    await textProvider.reissue({ modelId: 'org/model', fileName: 'file.gguf', url: 'https://hf/f', totalBytes: 100, combinedTotalBytes: 130, quantization: 'Q8', sha256: 'abc', metadataJson: JSON.stringify({ mmProjFileName: 'mm.gguf', mmProjDownloadUrl: 'https://hf/mm' }) } as never);
    expect(startModelDownload).toHaveBeenCalledWith('org/model', expect.objectContaining({ name: 'file.gguf', size: 100, quantization: 'Q8', sha256: 'abc', mmProjFile: { name: 'mm.gguf', size: 30, downloadUrl: 'https://hf/mm' } }));
    await textProvider.reissue({ modelId: 'm', fileName: 'f', url: 'u' } as never);
    expect(startModelDownload).toHaveBeenLastCalledWith('m', expect.objectContaining({ size: 0, quantization: 'Unknown' }));
  });

  it('tells subscribers when downloads change', () => {
    const changed = jest.fn();
    const off = textProvider.subscribe(changed);
    useDownloadStore.getState().add(entry() as never);
    expect(changed).toHaveBeenCalled();
    off();
  });

  it('does nothing on relaunch on Android, where the work resumes by itself', async () => {
    setOS('android');
    useDownloadStore.getState().add(entry() as never);
    await textProvider.reconcile?.();
    expect(mm.downloadModelBackground).not.toHaveBeenCalled();
  });

  it('on iOS drops a stale row for a model already on disk, and re-queues an interrupted one', async () => {
    setOS('ios');
    useAppStore.setState({ downloadedModels: [{ id: 'done/m/d.gguf', fileName: 'd', filePath: '/p', fileSize: 1 }] } as never);
    useDownloadStore.getState().add(entry({ modelKey: 'done/m/d.gguf', downloadId: 'dl-d' }) as never);
    useDownloadStore.getState().add(entry({ modelKey: 'org/model/x.gguf', downloadId: 'dl-x', fileName: 'x.gguf' }) as never);
    useDownloadStore.getState().add(entry({ modelKey: 'org/model/y.gguf', downloadId: 'dl-y', fileName: 'y.gguf', status: 'completed' }) as never);
    mm.downloadModelBackground.mockRejectedValueOnce(new Error('queue failed'));
    await textProvider.reconcile?.();
    await new Promise((r) => setImmediate(r));
    expect(useDownloadStore.getState().downloads['done/m/d.gguf']).toBeUndefined();
    expect(mm.downloadModelBackground).toHaveBeenCalledTimes(1);
  });
});

export {};
