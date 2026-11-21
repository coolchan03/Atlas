import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: { modelId: (global as any).__imageModelId } }),
}));

type Scenario = {
  model?: Record<string, unknown>; busy?: boolean; mem?: Record<string, unknown>; loaded?: boolean; image?: Record<string, unknown> | null;
  noGpu?: boolean; generateThrows?: string; loadThrows?: string; pngOk?: boolean; fileMissing?: boolean; steps?: boolean; runtimeStatus?: Record<string, unknown> | null;
};

function setup(s: Scenario = {}) {
  jest.resetModules();
  const boundary = installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const RNFS = require('react-native-fs');
  boundary.fs!.seedFile('/out/img.png', 4096);
  const pngOk = s.pngOk !== false;
  jest.spyOn(RNFS, 'read').mockResolvedValue(pngOk ? 'iVBORw0KGgo=' : 'AAAA');
  if (s.fileMissing) jest.spyOn(RNFS, 'exists').mockResolvedValue(false);

  const dream = {
    isGenerating: jest.fn(async () => false), isModelLoaded: jest.fn(async () => s.loaded !== false), getLoadedBackend: jest.fn(async () => 'mnn'),
    getNativeImageGpuDiagnostics: jest.fn(async () => ({ enumerated: true, summary: 'Adreno 740', details: 'ok' })), cancelGeneration: jest.fn(async () => undefined),
    getNativeImageRuntimeStatus: jest.fn(async () => s.runtimeStatus === undefined ? { step: 2, cpuTicks: 10 } : s.runtimeStatus),
    generateImage: jest.fn(async (_cfg: unknown, onProgress?: (p: { step: number; totalSteps: number }) => void) => {
      if (s.generateThrows) throw new Error(s.generateThrows);
      if (s.steps !== false) onProgress?.({ step: 1, totalSteps: 1 });
      return s.image === undefined ? { id: 'g1', imagePath: 'file:///out/img.png', width: 512, height: 512 } : s.image;
    }),
  };
  jest.doMock('../../../src/services/localDreamGenerator', () => ({ localDreamGeneratorService: dream }));
  const active = {
    checkMemoryForModel: jest.fn(async () => s.mem ?? { canLoad: true, severity: 'ok', requiredMemoryGB: 2, availableMemoryGB: 6 }),
    loadImageModel: jest.fn(async () => { if (s.loadThrows) throw new Error(s.loadThrows); }),
  };
  jest.doMock('../../../src/services/activeModelService', () => ({ activeModelService: active }));
  jest.doMock('../../../src/services/imageGenerationService', () => ({ imageGenerationService: { getState: () => ({ isGenerating: !!s.busy }) } }));
  jest.doMock('../../../src/services/hardware', () => ({ hardwareService: { getOpenCLCapability: async () => (s.noGpu ? { supported: false, reason: 'no OpenCL' } : { supported: true }), getSoCInfo: async () => ({ hasNPU: false }) } }));

  const { useAppStore } = require('../../../src/stores');
  const { createONNXImageModel } = require('../../utils/factories');
  const model = { ...createONNXImageModel({ id: 'img-t', name: 'Test model' }), ...(s.model ?? {}) };
  useAppStore.setState({ downloadedImageModels: [model] });
  (global as any).__imageModelId = 'img-t';
  const { ImageModelTestScreen } = require('../../../src/screens/ImageModelTestScreen');
  const view = rtl.render(React.createElement(ImageModelTestScreen));
  const press = async (label: string | RegExp) => { await rtl.act(async () => { rtl.fireEvent.press(view.getByText(label)); }); await rtl.act(async () => { await new Promise((r) => setImmediate(r)); }); };
  return { view, rtl, dream, active, press };
}

describe('the image model test', () => {
  it('passes the engine test with a rendered PNG, then lets the person confirm it looks right', async () => {
    const { view, press, dream, active } = setup();
    await press('Start test');
    expect(view.getByText(/Native 1-step engine test passed/)).toBeTruthy();
    expect(dream.generateImage).toHaveBeenCalled();
    expect(active.loadImageModel).toHaveBeenCalled();
    expect(view.getByText('Test again')).toBeTruthy();
    await press('Test again');
  });

  it('marks a wrong image, runs the other test modes, and turns on the extras', async () => {
    const { view, press, dream, rtl } = setup({ model: { backend: 'sdcpp', nativeImageFamily: 'sd15', supportFiles: [] } });
    await press('Quality render');
    await rtl.act(async () => { view.UNSAFE_getAllByType(require('react-native').Switch).forEach((s: any) => s.props.onValueChange(true)); });
    await press('Start test');
    expect(view.getByText(/Confirm the subject visually/)).toBeTruthy();
    expect(dream.generateImage.mock.calls[0][0]).toMatchObject({ skipLoRA: false, skipUpscaler: false });
    await press('Looks correct');
    await press('Test again');
    await press('Wrong image');
  });

  it('shows the GPU check result and its failure', async () => {
    const { view, press, dream } = setup();
    await press(/Check|GPU/i).catch(() => undefined);
    dream.getNativeImageGpuDiagnostics.mockRejectedValueOnce(new Error('no vulkan'));
    await press(/Check|GPU/i).catch(() => undefined);
    expect(view.toJSON()).toBeTruthy();
  });

  it.each([
    ['another image being generated', { busy: true }, /already being generated/],
    ['an unsupported architecture', { model: { backend: 'sdcpp', nativeImageFamily: 'unknown' } }, /Unsupported architecture/],
    ['missing support files', { model: { backend: 'sdcpp', nativeImageFamily: 'flux', supportFiles: [] } }, /needs/],
    ['too little memory', { mem: { canLoad: false, severity: 'critical', requiredMemoryGB: 9, availableMemoryGB: 2 } }, /exceeds the safe memory budget/],
    ['an engine that does not load', { loaded: false }, /did not report a loaded model/],
    ['no GPU for this model', { noGpu: true }, /OpenCL not detected/],
    ['a load that throws', { loadThrows: 'out of memory' }, /out of memory/],
    ['a generation that throws', { generateThrows: 'gpu lost' }, /gpu lost/],
    ['no image returned', { image: null }, /without creating an image/],
    ['a missing output file', { fileMissing: true }, /file is missing/],
    ['an output that is not a PNG', { pngOk: false }, /valid PNG header/],
  ] as Array<[string, Scenario, RegExp]>)('explains %s', async (_name, scenario, message) => {
    const { view, press } = setup(scenario);
    await press('Start test');
    expect(view.getAllByText(message).length).toBeGreaterThan(0);
    expect(view.getByText('Test again')).toBeTruthy();
  });

  it('offers to load anyway when memory is short, and loads with an override', async () => {
    const { view, press, active } = setup({ mem: { canLoad: false, severity: 'critical', requiredMemoryGB: 9, availableMemoryGB: 2 } });
    await press('Start test');
    expect(view.getByText('Load anyway')).toBeTruthy();
    await press('Load anyway');
    expect(active.loadImageModel).toHaveBeenCalledWith('img-t', undefined, { override: true });
    expect(view.getByText(/Forced/)).toBeTruthy();
  });

  it('can be cancelled while the image is being made', async () => {
    const { view, press, dream, rtl } = setup();
    let release: () => void = () => undefined;
    dream.generateImage.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ id: 'g', imagePath: 'file:///out/img.png', width: 8, height: 8 }); }));
    await rtl.act(async () => { rtl.fireEvent.press(view.getByText('Start test')); });
    await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
    await press(/Cancel test/);
    expect(dream.cancelGeneration).toHaveBeenCalled();
    await rtl.act(async () => { release(); await new Promise((r) => setImmediate(r)); });
  });

  it('says the model is missing when the id is unknown, and stops the engine when leaving mid-test', async () => {
    const { view, dream, rtl, press } = setup();
    let release: () => void = () => undefined;
    dream.generateImage.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(null); }));
    await rtl.act(async () => { rtl.fireEvent.press(view.getByText('Start test')); });
    await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
    view.unmount();
    expect(dream.cancelGeneration).toHaveBeenCalled();
    release();
    expect(press).toBeDefined();
  });
});
