jest.mock('react-native', () => {
  const handlers = new Map<string, Set<(event: any) => void>>();
  const native = {
    listBackends: jest.fn().mockResolvedValue([
      { name: 'Mali-G615', description: 'Vulkan', type: 'gpu' },
      { name: 'CPU', description: 'CPU', type: 'cpu' },
    ]),
    loadModel: jest.fn().mockResolvedValue('Vulkan'),
    formatChat: jest.fn().mockResolvedValue('<user>hi</user>'),
    tokenize: jest.fn().mockResolvedValue([1, 2]),
    activeBackend: jest.fn().mockResolvedValue('Vulkan'),
    generate: jest.fn().mockImplementation(async (_prompt: string, _limit: number, sessionId: string) => {
      handlers.get('AtlasVulkanToken')?.forEach(cb => cb({ sessionId: 'old-session', text: 'WRONG' }));
      handlers.get('AtlasVulkanToken')?.forEach(cb => cb({ sessionId, text: 'OK' }));
      handlers.get('AtlasVulkanEnd')?.forEach(cb => cb({ sessionId }));
      return true;
    }),
    interrupt: jest.fn().mockResolvedValue(true),
    unload: jest.fn().mockResolvedValue(true),
  };
  return {
    NativeModules: { AtlasVulkan: native },
    NativeEventEmitter: class {
      addListener(name: string, handler: (event: unknown) => void) {
        if (!handlers.has(name)) handlers.set(name, new Set());
        handlers.get(name)!.add(handler);
        return { remove: () => handlers.get(name)?.delete(handler) };
      }
    },
  };
});

import { NativeModules } from 'react-native';
import { vulkanEngine } from '../../../src/services/vulkanEngine';

const native = (NativeModules as any).AtlasVulkan;

beforeEach(() => jest.clearAllMocks());

it('detects a physically enumerated Vulkan GPU without depending on model name', async () => {
  expect(await vulkanEngine.isAvailable()).toBe(true);
  expect(native.listBackends).toHaveBeenCalledTimes(1);
});

it('loads a GGUF with a bounded offload request and delegates chat templates', async () => {
  await expect(vulkanEngine.loadModel('/models/qwen.gguf', 8, 2048, 4)).resolves.toBe('Vulkan');
  expect(native.loadModel).toHaveBeenCalledWith('/models/qwen.gguf', 8, 2048, 4);
  await expect(vulkanEngine.formatChat([{role:'user',content:'hi'}])).resolves.toBe('<user>hi</user>');
  expect(native.formatChat).toHaveBeenCalledWith('[{"role":"user","content":"hi"}]');
});

it('streams only current-session tokens and completes without leaking listeners', async () => {
  const parts: string[] = [];
  await vulkanEngine.generate('hello', 32, token => parts.push(token));
  expect(parts).toEqual(['OK']);
  const second: string[] = [];
  await vulkanEngine.generate('hello again', 32, token => second.push(token));
  expect(second).toEqual(['OK']);
});

it('can stop an active generation through the native interrupt command', async () => {
  let resolveNative!: (value: boolean) => void;
  native.generate.mockImplementationOnce(() => new Promise<boolean>(resolve => { resolveNative = resolve; }));
  const generating = vulkanEngine.generate('hi', 64, () => {});
  await vulkanEngine.interrupt();
  expect(native.interrupt).toHaveBeenCalledTimes(1);
  resolveNative(true);
  await generating;
});

it('unloads the native model safely', async () => {
  await vulkanEngine.unload();
  expect(native.unload).toHaveBeenCalledTimes(1);
});
