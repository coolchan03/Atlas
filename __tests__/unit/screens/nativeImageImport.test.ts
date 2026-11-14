/** Importing an original image model file: only recognised, runnable checkpoints are registered, and only with a valid result. */
type Info = { kind: string; family: string };

function load(opts: { os?: string; module?: Record<string, unknown> | null; info?: Info; result?: unknown; importThrows?: string } = {}) {
  jest.resetModules();
  const rn = require('react-native');
  rn.Platform.OS = opts.os ?? 'android';
  const events: Array<(e: { stage?: string; fraction?: number }) => void> = [];
  const remove = jest.fn();
  class FakeEmitter { addListener(_n: string, fn: (e: { stage?: string; fraction?: number }) => void) { events.push(fn); return { remove }; } }
  Object.defineProperty(rn, 'NativeEventEmitter', { configurable: true, value: FakeEmitter });
  const native = opts.module === null ? undefined : {
    inspectAtlasImageFile: jest.fn(async () => opts.info ?? { kind: 'image', family: 'sdxl' }),
    importAtlasImageFile: jest.fn(async () => {
      if (opts.importThrows) throw new Error(opts.importThrows);
      events.forEach((fn) => { fn({ stage: 'copy', fraction: 1.4 }); fn({ stage: 'other', fraction: 0.2 }); fn({ stage: 'copy' }); });
      return opts.result === undefined ? { modelDir: '/models/img', size: 4096, family: 'sdxl', variant: 'turbo' } : opts.result;
    }),
    ...(opts.module ?? {}),
  };
  rn.NativeModules.LocalDreamModule = native;
  const addDownloaded = jest.fn(async () => undefined);
  jest.doMock('../../../src/services', () => ({ modelManager: { getImageModelsDirectory: () => '/image-models', addDownloadedImageModel: addDownloaded } }));
  const mod = require('../../../src/screens/ModelsScreen/nativeImageImport');
  const { useAppStore } = require('../../../src/stores');
  useAppStore.setState({ downloadedImageModels: [], activeImageModelId: null });
  const deps = { setAlertState: jest.fn(), setImportProgress: jest.fn() };
  return { mod, native, deps, addDownloaded, useAppStore, remove };
}
const alertText = (deps: { setAlertState: jest.Mock }) => JSON.stringify(deps.setAlertState.mock.calls.at(-1)?.[0]);

describe('inspecting a file', () => {
  it('asks the native module, and refuses off Android or without the module', async () => {
    const { mod, native } = load();
    expect(await mod.inspectNativeImageFile('file:///a.safetensors', 'a.safetensors')).toEqual({ kind: 'image', family: 'sdxl' });
    expect(native!.inspectAtlasImageFile).toHaveBeenCalledWith({ uri: 'file:///a.safetensors', fileName: 'a.safetensors' });
    await expect(load({ os: 'ios' }).mod.inspectNativeImageFile('u', 'n')).rejects.toThrow('require the Android');
    await expect(load({ module: null }).mod.inspectNativeImageFile('u', 'n')).rejects.toThrow('require the Android');
  });
});

describe('importing a file', () => {
  it('says it is unavailable off Android', async () => {
    const t = load({ os: 'ios' });
    expect(await t.mod.importNativeImageFile('u', 'a.safetensors', t.deps)).toBe(false);
    expect(alertText(t.deps)).toContain('require Android');
  });

  it.each([
    ['a style add-on', { kind: 'lora', family: 'sdxl' }, 'LoRA'],
    ['an unsupported architecture', { kind: 'unsupported', family: 'unknown' }, 'AuraFlow'],
    ['an unknown file', { kind: 'unknown', family: 'unknown' }, 'not recognized'],
  ])('does not register %s', async (_n, info, text) => {
    const t = load({ info });
    expect(await t.mod.importNativeImageFile('u', 'a.safetensors', t.deps)).toBe(false);
    expect(alertText(t.deps)).toContain(text);
    expect(t.native!.importAtlasImageFile).not.toHaveBeenCalled();
  });

  it('registers the model, keeps its weights, shows copy progress, and makes it the active one when none is', async () => {
    const t = load();
    expect(await t.mod.importNativeImageFile('file:///My Model_v2.safetensors', 'My Model_v2.safetensors', t.deps)).toBe(true);
    const model = t.useAppStore.getState().downloadedImageModels[0];
    expect(model).toMatchObject({ name: 'My Model v2', backend: 'sdcpp', nativeImageFamily: 'sdxl', nativeImageVariant: 'turbo', size: 4096, modelPath: '/models/img' });
    expect(model.id).toMatch(/^local_image_My_Model_v2_/);
    expect(model.description).toContain('SAFETENSORS');
    expect(t.addDownloaded).toHaveBeenCalled();
    expect(t.useAppStore.getState().activeImageModelId).toBe(model.id);
    expect(t.deps.setImportProgress).toHaveBeenCalledWith({ fraction: 0.99, fileName: 'My Model_v2.safetensors' });
    expect(t.deps.setImportProgress).toHaveBeenLastCalledWith(null);
    expect(t.remove).toHaveBeenCalled();
    expect(alertText(t.deps)).toContain('imported without changing');
  });

  it('keeps an already-active image model, and takes the family the import reports', async () => {
    const t = load({ result: { modelDir: '/models/img2', size: 10, family: 'flux', variant: 'base' } });
    t.useAppStore.setState({ activeImageModelId: 'existing' });
    await t.mod.importNativeImageFile('u', 'flux.gguf', t.deps);
    expect(t.useAppStore.getState().activeImageModelId).toBe('existing');
    expect(t.useAppStore.getState().downloadedImageModels[0]).toMatchObject({ nativeImageFamily: 'flux', nativeImageVariant: 'base' });
  });

  it.each([
    ['no result', null, /valid model location/],
    ['no folder', { modelDir: ' ', size: 5, family: 'sdxl' }, /valid model location/],
    ['no size', { modelDir: '/x', size: 0, family: 'sdxl' }, /valid model location/],
    ['an unsupported family', { modelDir: '/x', size: 5, family: 'auraflow' }, /unsupported image architecture/],
  ])('refuses %s from the native import and registers nothing', async (_n, result, message) => {
    const t = load({ result });
    await expect(t.mod.importNativeImageFile('u', 'a.safetensors', t.deps)).rejects.toThrow(message);
    expect(t.useAppStore.getState().downloadedImageModels).toHaveLength(0);
    expect(t.deps.setImportProgress).toHaveBeenLastCalledWith(null);
  });

  it('lets a native failure through and still clears the progress', async () => {
    const t = load({ importThrows: 'copy failed' });
    await expect(t.mod.importNativeImageFile('u', 'a.safetensors', t.deps)).rejects.toThrow('copy failed');
    expect(t.remove).toHaveBeenCalled();
  });
});

export {};
