// Inference unit tests isolate chat persistence from the native Android Keystore.
jest.mock('../../../src/stores/encryptedChatStorage', () => ({ encryptedChatStorage: {
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined),
} }));
import { initLlama } from 'llama.rn';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { llmService } from '../../../src/services/llm';
import { vulkanEngine } from '../../../src/services/vulkanEngine';
import { useAppStore } from '../../../src/stores/appStore';
import { createMockLlamaContext, resetStores } from '../../utils/testHelpers';

const native = initLlama as jest.MockedFunction<typeof initLlama>;
const fs = RNFS as jest.Mocked<typeof RNFS>;
const initialPlatform = Platform.OS;
beforeAll(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' }); });
afterAll(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: initialPlatform }); });

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resetStores();
  (llmService as any).context = null;
  (llmService as any).vulkanLoaded = false;
  (llmService as any).currentModelPath = null;
  (llmService as any).vulkanFallbackReason = null;
  (llmService as any).contextMutexPromise = Promise.resolve();
  (llmService as any).isGenerating = false;
  (llmService as any).activeCompletionPromise = null;
  fs.exists.mockResolvedValue(true);
  fs.stat.mockResolvedValue({ size: 1000000, isFile: () => true } as any);
  useAppStore.setState({settings: {...useAppStore.getState().settings, inferenceBackend:'vulkan', gpuLayers:8, contextLength:2048}});
});

it('uses the isolated Vulkan engine when supported and retains model identity', async () => {
  jest.spyOn(vulkanEngine,'isAvailable').mockResolvedValue(true);
  jest.spyOn(vulkanEngine,'loadModel').mockResolvedValue('Vulkan');
  const stop = jest.spyOn(vulkanEngine,'unload').mockResolvedValue();
  await llmService.loadModel('/models/small.gguf');
  expect(llmService.isModelLoaded()).toBe(true);
  expect(llmService.getLoadedModelPath()).toBe('/models/small.gguf');
  expect(native).not.toHaveBeenCalled();
  expect(llmService.getGpuInfo().gpuBackend).toBe('Vulkan');
  await llmService.unloadModel();
  expect(stop).toHaveBeenCalled();
});

it('streams actual text through Vulkan while keeping the ordinary completion callbacks', async () => {
  jest.spyOn(vulkanEngine,'isAvailable').mockResolvedValue(true);
  jest.spyOn(vulkanEngine,'loadModel').mockResolvedValue('Vulkan');
  jest.spyOn(vulkanEngine,'formatChat').mockResolvedValue('formatted prompt');
  jest.spyOn(vulkanEngine,'generate').mockImplementation(async (_prompt,_limit,cb)=>{cb('Hello');cb(' world');});
  await llmService.loadModel('/models/small.gguf');
  const streamed: string[]=[];
  const onComplete=jest.fn();
  const content=await llmService.generateResponse([{id:'m',role:'user',content:'hi',timestamp:0}],{onStream:chunk=>streamed.push(chunk.content ?? ''),onComplete});
  expect(streamed).toEqual(['Hello',' world']);
  expect(content).toBe('Hello world');
  expect(onComplete).toHaveBeenCalledWith({content:'Hello world',reasoningContent:''});
});

it('rejects tool calls on explicit Vulkan without unloading or switching to CPU', async () => {
  jest.spyOn(vulkanEngine, 'isAvailable').mockResolvedValue(true);
  jest.spyOn(vulkanEngine, 'loadModel').mockResolvedValue('Vulkan');
  const unload = jest.spyOn(vulkanEngine, 'unload').mockResolvedValue();
  await llmService.loadModel('/models/small.gguf');
  await expect(llmService.generateResponseWithTools([{id:'m',role:'user',content:'hi',timestamp:0}], {tools:[]}))
    .rejects.toThrow('Select the CPU backend explicitly');
  expect(unload).not.toHaveBeenCalled();
  expect(native).not.toHaveBeenCalled();
  expect(llmService.getLoadedModelPath()).toBe('/models/small.gguf');
});

it('does not silently switch to CPU when the user explicitly selects Vulkan', async () => {
  jest.spyOn(vulkanEngine,'isAvailable').mockResolvedValue(false);
  const unload = jest.spyOn(vulkanEngine,'unload').mockResolvedValue();
  native.mockResolvedValue(createMockLlamaContext() as any);
  await expect(llmService.loadModel('/models/small.gguf')).rejects.toThrow('Vulkan GPU unavailable');
  expect(unload).toHaveBeenCalled();
  expect(native).not.toHaveBeenCalled();
  expect(llmService.isModelLoaded()).toBe(false);
  expect(llmService.getBackendFallbackNotice()).toContain('did not fall back to CPU');
});

it('still allows CPU when the caller explicitly requests it', async () => {
  const vulkanProbe = jest.spyOn(vulkanEngine,'isAvailable');
  native.mockResolvedValue(createMockLlamaContext() as any);
  await llmService.loadModel('/models/small.gguf', undefined, {forceCpu: true});
  expect(native).toHaveBeenCalled();
  expect(vulkanProbe).not.toHaveBeenCalled();
  expect(llmService.isModelLoaded()).toBe(true);
});

it('Auto selects OpenCL after a Vulkan load failure without trying CPU', async () => {
  const { hardwareService } = require('../../../src/services/hardware');
  const availability = jest.spyOn(hardwareService, 'getAccelerationCapability')
    .mockResolvedValue({ hasNpu: false, hasGpu: true });
  jest.spyOn(hardwareService, 'getOpenCLCapability').mockResolvedValue({ supported: true });
  jest.spyOn(vulkanEngine, 'isAvailable').mockResolvedValue(true);
  jest.spyOn(vulkanEngine, 'loadModel').mockRejectedValue(new Error('shader failed'));
  const unload = jest.spyOn(vulkanEngine, 'unload').mockResolvedValue();
  native.mockResolvedValue(createMockLlamaContext({ gpu: true, devices: ['Adreno GPU'] }) as any);
  useAppStore.setState({ settings: {
    ...useAppStore.getState().settings, inferenceBackend: 'auto', gpuLayers: 8,
  }});
  await llmService.loadModel('/models/small-Q4_0.gguf');
  expect(availability).toHaveBeenCalled();
  expect(unload).toHaveBeenCalled();
  expect(llmService.getSelectedBackend()).toBe('opencl');
  expect(llmService.getBackendFallbackNotice()).toContain('Auto selected OPENCL');
  expect(native).toHaveBeenCalledTimes(1);
  expect((native as jest.Mock).mock.calls[0][0].n_gpu_layers).toBeGreaterThan(0);
});

it('Auto falls back to CPU when all accelerators are unavailable', async () => {
  const { hardwareService } = require('../../../src/services/hardware');
  jest.spyOn(hardwareService, 'getAccelerationCapability')
    .mockResolvedValue({ hasNpu: false, hasGpu: false });
  jest.spyOn(vulkanEngine, 'isAvailable').mockResolvedValue(false);
  useAppStore.setState({ settings: {
    ...useAppStore.getState().settings, inferenceBackend: 'auto',
  }});
  native.mockResolvedValue(createMockLlamaContext({ gpu: false }) as any);
  await llmService.loadModel('/models/small.gguf');
  expect(llmService.getSelectedBackend()).toBe('cpu');
  expect(native).toHaveBeenCalled();
});

it('explicit OpenCL fails rather than loading CPU when GPU init fails', async () => {
  const { hardwareService } = require('../../../src/services/hardware');
  jest.spyOn(hardwareService, 'getOpenCLCapability').mockResolvedValue({ supported: true });
  native.mockRejectedValue(new Error('GPU unavailable'));
  useAppStore.setState({ settings: {
    ...useAppStore.getState().settings, inferenceBackend: 'opencl',
    gpuLayers: 8,
  }});
  await expect(llmService.loadModel('/models/small-Q4_0.gguf'))
    .rejects.toThrow('CPU fallback is disabled');
  expect(native).toHaveBeenCalledTimes(1);
});

it('uses a user-selected Vulkan context above the former 4K limit and honors sampling settings', async () => {
  useAppStore.setState({ settings: {
    ...useAppStore.getState().settings, inferenceBackend: 'vulkan', contextMode: 'manual',
    contextLength: 8192, maxTokens: 800, temperature: 0.35, topP: 0.75, repeatPenalty: 1.2,
  }});
  jest.spyOn(vulkanEngine, 'isAvailable').mockResolvedValue(true);
  const load = jest.spyOn(vulkanEngine, 'loadModel').mockResolvedValue('Vulkan');
  jest.spyOn(vulkanEngine, 'formatChat').mockResolvedValue('small prompt');
  jest.spyOn(vulkanEngine, 'tokenize').mockResolvedValue([1, 2, 3, 4]);
  const generate = jest.spyOn(vulkanEngine, 'generate').mockResolvedValue();
  await llmService.loadModel('/models/small.gguf');
  expect(load.mock.calls[0][2]).toBeGreaterThan(4096);
  await llmService.generateResponse([{id:'q',role:'user',content:'Hello',timestamp:0}]);
  expect(generate).toHaveBeenCalledWith('small prompt', 800, expect.any(Function), {
    temperature: 0.35, topP: 0.75, repeatPenalty: 1.2,
  });
});

it('trims old turns before formatting a long Vulkan chat', async () => {
  useAppStore.setState({ settings: {
    ...useAppStore.getState().settings, inferenceBackend: 'vulkan', contextMode: 'manual',
    contextLength: 1024, maxTokens: 256,
  }});
  jest.spyOn(vulkanEngine, 'isAvailable').mockResolvedValue(true);
  jest.spyOn(vulkanEngine, 'loadModel').mockResolvedValue('Vulkan');
  const fmt = jest.spyOn(vulkanEngine, 'formatChat')
    .mockImplementation(async items => JSON.stringify(items));
  jest.spyOn(vulkanEngine, 'tokenize')
    .mockImplementation(async text => Array(Math.ceil(text.length / 4)).fill(1));
  jest.spyOn(vulkanEngine, 'generate').mockResolvedValue();
  await llmService.loadModel('/models/small.gguf');
  const history: any[] = [{id:'system',role:'system',content:'Rules',timestamp:0}];
  for (let n = 0; n < 18; n++) history.push({id:String(n),role:n%2 ? 'assistant' : 'user',content:'x'.repeat(220),timestamp:0});
  history.push({id:'last',role:'user',content:'Final question',timestamp:0});
  await llmService.generateResponse(history);
  const finalCall = fmt.mock.calls[fmt.mock.calls.length - 1][0];
  expect(finalCall.some(item => item.content === 'Rules')).toBe(true);
  expect(finalCall.some(item => item.content === 'Final question')).toBe(true);
  expect(finalCall.length).toBeLessThan(history.length);
  expect(history).toHaveLength(20);
});
