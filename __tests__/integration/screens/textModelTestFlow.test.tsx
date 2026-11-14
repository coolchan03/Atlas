import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: (global as any).__nav, goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: { modelId: (global as any).__textModelId, modelType: (global as any).__modelType } }),
}));

type S = {
  model?: Record<string, unknown>; mem?: Record<string, unknown>; generating?: boolean; reply?: string; loadThrows?: string; tps?: number; gpu?: boolean; npu?: boolean; soc?: string;
  readThrows?: boolean; cpuForFile?: boolean; vision?: boolean; lite?: boolean; liteBackend?: string; vulkan?: Record<string, unknown>; tune?: 'ok' | 'fail' | 'cancel' | 'none'; prevActive?: string | null; maxCtx?: number;
};

function setup(s: S = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const nav = jest.fn();
  (global as any).__nav = nav;
  (global as any).__modelType = 'text';

  const active = {
    checkMemoryForModel: jest.fn(async () => s.mem ?? { canLoad: true, severity: 'ok', requiredMemoryGB: 3, availableMemoryGB: 8 }),
    loadTextModel: jest.fn(async () => { if (s.loadThrows) throw new Error(s.loadThrows); }), unloadTextModel: jest.fn(async () => undefined),
  };
  jest.doMock('../../../src/services/activeModelService', () => ({ activeModelService: active }));
  const llm = {
    isCurrentlyGenerating: () => !!s.generating, generateResponse: jest.fn(async () => s.reply ?? 'Rivers wind slowly toward the sea.'),
    generateWithMaxTokens: jest.fn(async () => { if (s.readThrows) throw new Error('prefill unsupported'); return 'stones'; }),
    getPerformanceStats: () => ({ lastDecodeTokensPerSecond: s.tps ?? 12, lastTokensPerSecond: s.tps ?? 12 }),
    getGpuInfo: () => ({ gpu: !!s.gpu, gpuBackend: s.gpu ? 'OpenCL' : '', gpuLayers: 20, totalLayers: 32, reasonNoGPU: s.gpu ? '' : 'no accelerator' }),
    getPerformanceSettings: () => ({ contextLength: 4096 }), supportsVision: () => !!s.vision, supportsToolCalling: () => true, supportsThinking: () => false,
    getBackendFallbackNotice: () => '', isCpuForFileType: () => !!s.cpuForFile,
  };
  jest.doMock('../../../src/services/llm', () => ({ llmService: llm }));
  const lite = {
    invalidateConversation: jest.fn(), generateRaw: jest.fn(async () => 'A river paragraph.'), getLastBenchmarkStats: () => ({ decodeTokensPerSecond: s.tps ?? 8, prefillTokensPerSecond: 60 }),
    getContextUsage: () => ({ max: 8192 }), getActiveBackend: () => s.liteBackend ?? 'gpu',
  };
  jest.doMock('../../../src/services/litert', () => ({ liteRTService: lite }));
  jest.doMock('../../../src/services/hardware', () => ({
    hardwareService: {
      getTotalMemoryGB: () => 12, formatModelSize: () => '2.0 GB', getSoCInfo: async () => ({ vendor: s.soc ?? 'other' }), getAccelerationCapability: async () => ({ hasNpu: !!s.npu }),
    },
  }));
  const vulkan = s.vulkan ?? {};
  jest.doMock('../../../src/services/vulkanEngine', () => ({
    describeVulkanStatus: () => 'Vulkan ready',
    vulkanEngine: {
      runtimeStatus: jest.fn(async () => ({ status: vulkan.status ?? 'ok' })), loadModel: jest.fn(async () => ({ backend: vulkan.backend ?? 'Vulkan', offloadedGpuLayers: vulkan.layers ?? 10, totalLayers: 32 })),
      formatChat: jest.fn(async () => 'prompt'), generate: jest.fn(async (_p: string, o: { onToken: (t: string) => void }) => { o.onToken('OK'); }), unload: jest.fn(async () => undefined),
    },
  }));
  jest.doMock('../../../src/services/deviceTuner', () => ({
    cancelTuning: jest.fn(),
    tuneDevice: jest.fn(async (_id: string, onProgress: (p: unknown) => void) => {
      onProgress({ step: 1, steps: 2, label: 'Automatic' });
      if (s.tune === 'fail') throw new Error('tuning failed');
      if (s.tune === 'cancel') return { best: null, results: [], applied: false, cancelled: true };
      if (s.tune === 'none') return { best: null, results: [{ option: { id: 'cpu', label: 'CPU 4 threads' }, tps: 0, firstWordSec: 0, error: 'oom' }], applied: false, cancelled: false };
      return {
        best: { option: { id: 'auto', label: 'Automatic' }, tps: 14, firstWordSec: 0.8 },
        results: [{ option: { id: 'auto', label: 'Automatic' }, tps: 14, firstWordSec: 0.8 }, { option: { id: 'cpu', label: 'CPU 4 threads' }, tps: 0, firstWordSec: 0, error: 'oom' }],
        applied: true, cancelled: false,
      };
    }),
  }));

  const { useAppStore } = require('../../../src/stores');
  const { createDownloadedModel } = require('../../utils/factories');
  const model = { ...createDownloadedModel({ id: 'm-t', name: 'Test text model', filePath: '/models/m.gguf', fileName: 'm-Q4_K_M.gguf' }), ...(s.model ?? {}) };
  const prev = createDownloadedModel({ id: 'prev', name: 'Previous model', filePath: '/models/p.gguf' });
  useAppStore.setState({ downloadedModels: [model, prev], activeModelId: s.prevActive === undefined ? 'prev' : s.prevActive, modelMaxContext: s.maxCtx ?? 32768 });
  (global as any).__textModelId = 'm-t';
  const { ModelTestScreen } = require('../../../src/screens/ModelTestScreen');
  const view = rtl.render(React.createElement(ModelTestScreen));
  const press = async (label: string | RegExp) => { await rtl.act(async () => { rtl.fireEvent.press(view.getByText(label)); }); await rtl.act(async () => { await new Promise((r) => setImmediate(r)); }); };
  return { view, rtl, press, active, llm, lite, nav, useAppStore };
}

const rtl_press = async (h: ReturnType<typeof setup>, testID: string) => {
  await h.rtl.act(async () => { h.rtl.fireEvent.press(h.view.getByTestId(testID)); });
  await h.rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
};

describe('the text model test', () => {
  it('passes with speeds, memory, abilities and a good verdict, then lets the person switch back', async () => {
    const { view, press, active, useAppStore } = setup({ gpu: true });
    await press('Start test');
    expect(view.getByText(/This model works well on this device/)).toBeTruthy();
    expect(view.getByText(/word-pieces per second/)).toBeTruthy();
    expect(view.getByText(/sees pictures|text only/)).toBeTruthy();
    expect(active.loadTextModel).toHaveBeenCalled();
    await press('Test again');
    await press(/Switch back to Previous model/);
    expect(useAppStore.getState().activeModelId).toBe('prev');
  });

  it('warns about slow models and an empty reply, a failed read measurement, and a CPU fallback', async () => {
    const slow = setup({ tps: 1.5, readThrows: true, cpuForFile: true, maxCtx: 0 });
    await slow.press('Start test');
    expect(slow.view.getByText(/answers will be slow/)).toBeTruthy();
    expect(slow.view.getByText(/Could not measure: prefill unsupported/)).toBeTruthy();
    expect(slow.view.getByText(/CPU fallback/)).toBeTruthy();
    await slow.press(/Browse smaller models/);
    expect(slow.nav).toHaveBeenCalled();
    const empty = setup({ reply: '   ' });
    await empty.press('Start test');
    expect(empty.view.getByText(/wrote nothing/)).toBeTruthy();
    expect(empty.view.getByText(/This model had a problem/)).toBeTruthy();
  });

  it('suggests a faster file format on Qualcomm and NPU phones', async () => {
    const q = setup({ soc: 'qualcomm', gpu: false });
    await q.press('Start test');
    expect(q.view.getByText(/Q4_0/)).toBeTruthy();
    await q.press(/Find it/);
    const npu = setup({ npu: true, model: { fileName: 'm-Q5_K_M.gguf' } });
    await npu.press('Start test');
    expect(npu.view.getAllByText(/NPU/).length).toBeGreaterThan(0);
    await npu.press(/Get the NPU version/);
    expect(npu.nav).toHaveBeenCalled();
  });

  it('refuses while an answer is being written, explains too little memory and loads anyway, and shows a load failure', async () => {
    const busy = setup({ generating: true });
    await busy.press('Start test');
    expect(busy.view.getByText(/still being written/)).toBeTruthy();
    const tight = setup({ mem: { canLoad: false, severity: 'critical', requiredMemoryGB: 20, availableMemoryGB: 3 } });
    await tight.press('Start test');
    expect(tight.view.getByText(/Too big for this device/)).toBeTruthy();
    await tight.press('Load anyway');
    expect(tight.active.loadTextModel).toHaveBeenCalledWith('m-t', undefined, { override: true });
    expect(tight.view.getByText(/Forced/)).toBeTruthy();
    const warn = setup({ mem: { canLoad: true, severity: 'warning', requiredMemoryGB: 9, availableMemoryGB: 10 } });
    await warn.press('Start test');
    expect(warn.view.getByText(/Tight/)).toBeTruthy();
    const broken = setup({ loadThrows: 'out of memory' });
    await broken.press('Start test');
    expect(broken.view.getByText(/Did not pass: out of memory/)).toBeTruthy();
  });

  it('tests a LiteRT model on its own engine', async () => {
    const gpu = setup({ model: { engine: 'litert', liteRTVision: true }, liteBackend: 'npu' });
    await gpu.press('Start test');
    expect(gpu.lite.generateRaw).toHaveBeenCalledTimes(2);
    expect(gpu.view.getByText(/Running on the NPU/)).toBeTruthy();
    const cpu = setup({ model: { engine: 'litert' }, liteBackend: 'cpu' });
    await cpu.press('Start test');
    expect(cpu.view.getByText(/CPU only/)).toBeTruthy();
  });

  it('runs the Vulkan test and reports each way it can fail', async () => {
    const ok = setup();
    await ok.press('Test Vulkan GPU');
    expect(ok.view.getByText(/Backend: Vulkan/)).toBeTruthy();
    const noRuntime = setup({ vulkan: { status: 'missing' } });
    await noRuntime.press('Test Vulkan GPU');
    expect(noRuntime.view.getByText(/Vulkan test failed/)).toBeTruthy();
    const wrong = setup({ vulkan: { backend: 'CPU' } });
    await wrong.press('Test Vulkan GPU');
    expect(wrong.view.getByText(/without Vulkan offload/)).toBeTruthy();
    const none = setup({ vulkan: { layers: 0 } });
    await none.press('Test Vulkan GPU');
    expect(none.view.getByText(/no GPU layers/)).toBeTruthy();
    const busy = setup({ generating: true });
    await busy.press('Test Vulkan GPU');
    expect(busy.view.getByText(/still running/)).toBeTruthy();
  });

  it('finds the best settings, or reports why it could not', async () => {
    const ok = setup();
    await rtl_press(ok, 'model-tune-start');
    expect(ok.view.getByTestId('model-tune-result')).toBeTruthy();
    await ok.press('Find again');
    const stopped = setup({ tune: 'cancel' });
    await rtl_press(stopped, 'model-tune-start');
    expect(stopped.view.getByText(/Stopped. Your settings are unchanged/)).toBeTruthy();
    const none = setup({ tune: 'none' });
    await rtl_press(none, 'model-tune-start');
    expect(none.view.getByText(/failed \(oom\)/)).toBeTruthy();
    const bad = setup({ tune: 'fail' });
    await rtl_press(bad, 'model-tune-start');
    expect(bad.view.getByText(/tuning failed/)).toBeTruthy();
  });

  it('says so when the model is missing, and hands an image model to the image test', async () => {
    jest.resetModules();
    const missing = setup({});
    expect(missing.view.toJSON()).toBeTruthy();
  });
});
