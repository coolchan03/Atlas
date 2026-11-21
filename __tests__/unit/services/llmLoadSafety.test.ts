/**
 * Model loading must never crash the app, leave a native context behind, or repeat a configuration that killed
 * the process. These pin the load-safety behaviour of LLMService.loadModel (see src/services/loadGuard.ts).
 */
jest.mock('../../../src/stores/encryptedChatStorage', () => ({ encryptedChatStorage: {
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined),
} }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initLlama } from 'llama.rn';
import RNFS from 'react-native-fs';
import { llmService } from '../../../src/services/llm';
import { hardwareService } from '../../../src/services/hardware';
import { useAppStore } from '../../../src/stores/appStore';
import { APP_CONFIG } from '../../../src/constants';
import { __resetLoadGuardForTests, recoverFromPreviousRun, enterStage } from '../../../src/services/loadGuard';
import { resetStores, createMockLlamaContext } from '../../utils/testHelpers';

const mockedInitLlama = initLlama as jest.MockedFunction<typeof initLlama>;
const mockedRNFS = RNFS as jest.Mocked<typeof RNFS>;
const KEY = '@atlas/loadGuard.v1';
const store: Record<string, string> = {};
const MODEL = '/models/test.gguf';
const MMPROJ = '/models/test-mmproj.gguf';
const DRAFT = '/models/test.mtp.gguf';

function setSettings(patch: Record<string, unknown>) {
  useAppStore.setState({ settings: { ...useAppStore.getState().settings, ...patch } });
}
function resetService() {
  const s = llmService as any;
  Object.assign(s, { context: null, currentModelPath: null, isGenerating: false, multimodalSupport: null, multimodalInitialized: false,
    gpuEnabled: false, gpuReason: '', gpuDevices: [], activeGpuLayers: 0, mtpActive: false, loadReport: null, requestedBackendAtLoad: null,
    contextMutexPromise: Promise.resolve() });
  s.currentSettings = { nThreads: 4, nBatch: 512, contextLength: 2048 };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockedRNFS.stat.mockResolvedValue({ size: 1_000_000, isFile: () => true } as any);
  mockedRNFS.exists.mockResolvedValue(true);
  resetStores();
  resetService();
  for (const k of Object.keys(store)) delete store[k];
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => store[k] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => { store[k] = v; });
  __resetLoadGuardForTests();
  setSettings({ inferenceBackend: 'cpu', useMtp: true, safeModelLoading: false });
});

describe('breadcrumbs', () => {
  it('saves where the load is BEFORE the native init runs, and clears it afterwards', async () => {
    let seenDuringInit: any = null;
    mockedInitLlama.mockImplementation((async () => {
      seenDuringInit = JSON.parse(store[KEY]).inFlight;
      return createMockLlamaContext();
    }) as any);
    await llmService.loadModel(MODEL);
    expect(seenDuringInit).toMatchObject({ modelPath: MODEL, stage: 'init', backend: 'cpu' });
    expect(JSON.parse(store[KEY]).inFlight).toBeNull();
  });

  it('marks the MTP stage when a draft file is attached', async () => {
    let seen: any = null;
    mockedInitLlama.mockImplementation((async () => { seen = JSON.parse(store[KEY]).inFlight; return createMockLlamaContext(); }) as any);
    await llmService.loadModel(MODEL, undefined, { draftPath: DRAFT });
    expect(seen).toMatchObject({ stage: 'draft', mtp: true });
  });

  it('records the failing stage and the real error when a load fails without crashing', async () => {
    mockedInitLlama.mockRejectedValue(new Error('Failed to load model'));
    await expect(llmService.loadModel(MODEL)).rejects.toThrow();
    const saved = JSON.parse(store[KEY]);
    expect(saved.inFlight).toBeNull();
    expect(saved.failures.at(-1)).toMatchObject({ modelPath: MODEL, stage: 'init' });
    expect(saved.failures.at(-1).message).toMatch(/Failed to load model/);
  });
});

describe('speculative decoding that is slower on this phone', () => {
  const { useSpecBenefit } = require('../../../src/atlasTools/specBenefit');
  const slow = { on: { decode: 3, samples: 4 }, off: { decode: 5, samples: 4 } };

  it('is left out of the load, says why, and is not started', async () => {
    useAppStore.setState({ activeModelId: 'm1' });
    useSpecBenefit.setState({ byModel: { m1: slow } });
    let seen: any = null;
    mockedInitLlama.mockImplementation((async (params: any) => { seen = params; return createMockLlamaContext(); }) as any);
    await llmService.loadModel(MODEL, undefined, { draftPath: DRAFT });
    expect(seen.draft_model ?? seen.speculative ?? seen.mtp).toBeFalsy();
    expect(llmService.getLoadReport()?.notes.join(' ')).toMatch(/left off for this model because it made replies about 40% slower/);
    expect(llmService.getLoadReport()?.mtp.loaded).toBe(false);
  });

  it('is used when it is not slower', async () => {
    useAppStore.setState({ activeModelId: 'm1' });
    useSpecBenefit.setState({ byModel: { m1: { on: { decode: 6, samples: 4 }, off: { decode: 5, samples: 4 } } } });
    await llmService.loadModel(MODEL, undefined, { draftPath: DRAFT });
    expect(llmService.getLoadReport()?.notes.join(' ')).not.toMatch(/left off for this model/);
  });
});

describe('Safe Model Loading', () => {
  it('runs on the CPU with no picture file and no MTP, even when all three are configured', async () => {
    setSettings({ safeModelLoading: true, inferenceBackend: 'opencl' });
    const ctx = createMockLlamaContext();
    mockedInitLlama.mockResolvedValue(ctx as any);
    await llmService.loadModel(MODEL, MMPROJ, { draftPath: DRAFT, embeddedMtp: true });
    const params = mockedInitLlama.mock.calls[0][0] as any;
    expect(params.n_gpu_layers).toBe(0);
    expect(params.model_draft).toBeUndefined();
    expect(params.speculative).toBeUndefined();
    expect(ctx.initMultimodal).not.toHaveBeenCalled();
    const report = llmService.getLoadReport()!;
    expect(report.safeMode).toBe(true);
    expect(report.vision).toMatchObject({ loaded: false, estimatedMB: 0, skippedBecause: 'Safe Model Loading is on' });
    expect(report.mtp).toMatchObject({ loaded: false, skippedBecause: 'Safe Model Loading is on' });
    expect(llmService.supportsVision()).toBe(false);
  });

  it('reloads a model that is already loaded when Safe Model Loading is switched on', async () => {
    mockedInitLlama.mockImplementation((async () => createMockLlamaContext()) as any);
    await llmService.loadModel(MODEL, MMPROJ);
    expect(llmService.supportsVision()).toBe(true);
    setSettings({ safeModelLoading: true });
    await llmService.loadModel(MODEL, MMPROJ);
    expect(mockedInitLlama).toHaveBeenCalledTimes(2);
    expect(llmService.supportsVision()).toBe(false);
  });
});

describe('optional components report what is really running', () => {
  it('reports a loaded picture file with its size', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 600 * 1024 * 1024, isFile: () => true } as any);
    mockedInitLlama.mockImplementation((async () => createMockLlamaContext()) as any);
    await llmService.loadModel(MODEL, MMPROJ);
    expect(llmService.getLoadReport()!.vision).toMatchObject({ requested: true, loaded: true, estimatedMB: 600 });
  });

  it('reports MTP as loaded only when the engine started it, and runs text-only when no files are given', async () => {
    mockedInitLlama.mockImplementation((async () => createMockLlamaContext()) as any);
    await llmService.loadModel(MODEL);
    expect(llmService.getLoadReport()).toMatchObject({ vision: { loaded: false, requested: false }, mtp: { kind: 'none', loaded: false } });
  });

  it('reloads without a picture file that has since been switched off, so its memory is freed', async () => {
    mockedInitLlama.mockImplementation((async () => createMockLlamaContext()) as any);
    await llmService.loadModel(MODEL, MMPROJ);
    await llmService.loadModel(MODEL, undefined);
    expect(mockedInitLlama).toHaveBeenCalledTimes(2);
    expect(llmService.getLoadReport()!.vision.loaded).toBe(false);
  });

  it('does not reload a model again just because MTP was requested but could not start', async () => {
    mockedInitLlama.mockImplementation((async (p: any) => { if (p.speculative) throw new Error('mtp unsupported'); return createMockLlamaContext(); }) as any);
    await llmService.loadModel(MODEL, undefined, { draftPath: DRAFT });
    const calls = mockedInitLlama.mock.calls.length;
    await llmService.loadModel(MODEL, undefined, { draftPath: DRAFT });
    expect(mockedInitLlama).toHaveBeenCalledTimes(calls);
    expect(llmService.getLoadReport()!.mtp).toMatchObject({ loaded: false, skippedBecause: 'it could not start' });
  });
});

describe('built-in MTP is reported from the model file, not from the switch', () => {
  const withMetadata = (metadata: Record<string, unknown>) => createMockLlamaContext({ model: { metadata, chatTemplates: { jinja: {} } } });

  it('is active when the file has MTP layers', async () => {
    mockedInitLlama.mockResolvedValue(withMetadata({ 'general.architecture': 'qwen35', 'qwen35.nextn_predict_layers': 1 }) as any);
    await llmService.loadModel(MODEL, undefined, { embeddedMtp: true });
    expect(llmService.getLoadReport()!.mtp).toMatchObject({ kind: 'embedded', loaded: true });
    expect(llmService.getEmbeddedMtpLayers()).toBe(1);
  });

  it('is NOT reported active when the file has no MTP layers, however the switch is set', async () => {
    mockedInitLlama.mockResolvedValue(withMetadata({ 'general.architecture': 'llama', 'general.name': 'Totally-MTP-Model' }) as any);
    await llmService.loadModel(MODEL, undefined, { embeddedMtp: true });
    const report = llmService.getLoadReport()!;
    expect(report.mtp).toMatchObject({ loaded: false, skippedBecause: 'this model file has no MTP layers built in' });
    expect(report.notes.join(' ')).toMatch(/no MTP layers built in/);
    expect(llmService.getEmbeddedMtpLayers()).toBe(0);
  });

  it('leaves it as it was when the metadata cannot be read (unknown is not "none")', async () => {
    mockedInitLlama.mockResolvedValue(createMockLlamaContext() as any);
    await llmService.loadModel(MODEL, undefined, { embeddedMtp: true });
    expect(llmService.getLoadReport()!.mtp.loaded).toBe(true);
    expect(llmService.getEmbeddedMtpLayers()).toBeNull();
  });
});

describe('a configuration that crashed the process is not repeated', () => {
  async function crashDuring(stage: 'draft' | 'vision' | 'init', mtp: boolean, vision: boolean) {
    await enterStage({ modelPath: MODEL, backend: 'cpu', mtp, vision, stage });
    __resetLoadGuardForTests(); // the process died here
    await recoverFromPreviousRun();
  }

  it('drops MTP and the picture file on the next load and says so, leaving the files attached', async () => {
    await crashDuring('vision', true, true);
    const ctx = createMockLlamaContext();
    mockedInitLlama.mockResolvedValue(ctx as any);
    await llmService.loadModel(MODEL, MMPROJ, { draftPath: DRAFT });
    const params = mockedInitLlama.mock.calls[0][0] as any;
    expect(params.speculative).toBeUndefined();
    expect(ctx.initMultimodal).not.toHaveBeenCalled();
    const report = llmService.getLoadReport()!;
    expect(report.notes.join(' ')).toMatch(/closed while starting the picture/);
    expect(report.vision.skippedBecause).toBe('a crash last time');
  });

  it('refuses an explicitly chosen accelerator that crashed instead of crashing again', async () => {
    setSettings({ inferenceBackend: 'cpu' });
    await crashDuring('init', false, false);
    await expect(llmService.loadModel(MODEL)).rejects.toThrow(/damaged or unsupported/);
    expect(mockedInitLlama).not.toHaveBeenCalled();
  });

  it('a clean lean load does not erase the crash recorded for the fuller configuration', async () => {
    await crashDuring('vision', true, true);
    mockedInitLlama.mockImplementation((async () => createMockLlamaContext()) as any);
    await llmService.loadModel(MODEL); // lean: records success for the lean config only
    expect(JSON.parse(store[KEY]).crashes[`${MODEL}|cpu|mtp:1|vision:1`]).toBeDefined();
  });
});

describe('failed or abandoned loads leave nothing behind', () => {
  it('releases the native context when setting it up fails after init', async () => {
    const ctx = createMockLlamaContext();
    mockedInitLlama.mockResolvedValue(ctx as any);
    jest.spyOn(llmService as any, 'applyLoadedContext').mockRejectedValue(new Error('boom'));
    await expect(llmService.loadModel(MODEL)).rejects.toThrow('boom');
    expect(ctx.release).toHaveBeenCalledTimes(1);
    expect(llmService.isModelLoaded()).toBe(false);
  });

  it('a load the caller gave up on releases its context instead of becoming the live model', async () => {
    const ctx = createMockLlamaContext();
    let resolveInit: (c: unknown) => void = () => {};
    mockedInitLlama.mockImplementation((() => new Promise((r) => { resolveInit = r; })) as any);
    const pending = llmService.loadModel(MODEL);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    llmService.abandonPendingLoad(); // the loader's timeout fired
    resolveInit(ctx);
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(ctx.release).toHaveBeenCalledTimes(1);
    expect(llmService.isModelLoaded()).toBe(false);
    expect(llmService.getLoadedModelPath()).toBeNull();
  });

  it('a load abandoned while queued never starts the native engine', async () => {
    let releaseFirst: (c: unknown) => void = () => {};
    mockedInitLlama.mockImplementationOnce((() => new Promise((r) => { releaseFirst = r; })) as any);
    const first = llmService.loadModel('/models/a.gguf');
    await new Promise((r) => setImmediate(r));
    const second = llmService.loadModel('/models/b.gguf');
    llmService.abandonPendingLoad();
    releaseFirst(createMockLlamaContext());
    await expect(first).rejects.toThrow(/cancelled/);
    await expect(second).rejects.toThrow(/cancelled/);
    expect(mockedInitLlama).toHaveBeenCalledTimes(1);
  });

  it('a later load works normally after an abandoned one', async () => {
    let resolveInit: (c: unknown) => void = () => {};
    mockedInitLlama.mockImplementationOnce((() => new Promise((r) => { resolveInit = r; })) as any);
    const pending = llmService.loadModel(MODEL);
    await new Promise((r) => setImmediate(r));
    llmService.abandonPendingLoad();
    resolveInit(createMockLlamaContext());
    await expect(pending).rejects.toThrow();
    mockedInitLlama.mockImplementation((async () => createMockLlamaContext()) as any);
    await llmService.loadModel(MODEL);
    expect(llmService.isModelLoaded()).toBe(true);
  });

  it('forgets a released context even when waiting for its memory to come back throws (unload)', async () => {
    const ctx = createMockLlamaContext();
    mockedInitLlama.mockResolvedValue(ctx as any);
    await llmService.loadModel(MODEL);
    jest.spyOn(hardwareService, 'getProcessMemory').mockRejectedValue(new Error('no memory info'));
    await llmService.unloadModel();
    expect(ctx.release).toHaveBeenCalled();
    expect(llmService.isModelLoaded()).toBe(false);
    expect(llmService.getLoadReport()).toBeNull();
  });
});

describe('context upgrade', () => {
  it('goes back to the size that worked when the bigger one fails, instead of failing the load', async () => {
    jest.spyOn(hardwareService, 'getDeviceInfo').mockResolvedValue({ totalMemory: 16 * 1024 ** 3, availableMemory: 8 * 1024 ** 3 } as any);
    (llmService as any).currentSettings.contextLength = APP_CONFIG.maxContextLength;
    const small = createMockLlamaContext({ model: { metadata: { 'llama.context_length': '8192' } } });
    const restored = createMockLlamaContext({ model: { metadata: { 'llama.context_length': '8192' } } });
    let call = 0;
    mockedInitLlama.mockImplementation((async (p: any) => {
      call++;
      if (call === 1) return small;
      // The upgrade's own three attempts (GPU, CPU, CPU at 2048) all fail; the 5th call is the restore at the old size.
      if (call <= 4) throw new Error(`allocation failed at ${p.n_ctx}`);
      return restored;
    }) as any);
    const result = await (llmService as any).initWithAutoContext({ baseParams: { model: MODEL }, ctxLen: 2048, nGpuLayers: 0, fileSize: 1e6 }, 'cpu', false);
    expect(small.release).toHaveBeenCalled(); // released before the bigger attempt (never both in memory)
    expect(result.context).toBe(restored);
    expect(result.actualLength).toBe(2048);
  });
});
