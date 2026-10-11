import { NativeEventEmitter, NativeModules } from 'react-native';

/** Experimental text-only Vulkan engine. Never substitutes for llama.rn silently. */
type Backend = { name: string; description: string; type: string };
type VulkanModule = {
  listBackends(): Promise<Backend[]>;
  loadModel(path: string, gpuLayers: number, context: number, threads: number): Promise<string>;
  activeBackend(): Promise<string>;
  generate(prompt: string, maxTokens: number, sessionId: string): Promise<boolean>;
  interrupt(sessionId: string): Promise<boolean>;
  unload(): Promise<boolean>;
};
const getNative = (): VulkanModule | null =>
  (NativeModules.AtlasVulkan as VulkanModule | undefined) ?? null;

let activeSession: string | null = null;
let generationCounter = 0;

function required(): VulkanModule {
  const module = getNative();
  if (!module) throw new Error('Vulkan runtime not packaged in this APK');
  return module;
}

export const vulkanEngine = {
  async listBackends(): Promise<Backend[]> {
    const module = getNative();
    if (!module) return [];
    return module.listBackends();
  },
  async isAvailable(): Promise<boolean> {
    try {
      const backends = await this.listBackends();
      return backends.some(b =>
        b.type.toLowerCase().includes('gpu') && /vulkan/i.test(b.description + ' ' + b.name),
      );
    } catch {
      return false;
    }
  },
  async loadModel(path: string, gpuLayers: number, context = 4096, threads = 0): Promise<string> {
    if (activeSession) throw new Error('Cannot replace a model while generating');
    return required().loadModel(path, gpuLayers, context, threads);
  },
  async activeBackend(): Promise<string> {
    return required().activeBackend();
  },
  async generate(prompt: string, maxTokens: number, onToken: (text: string) => void): Promise<void> {
    if (activeSession) throw new Error('Vulkan generation is already active');
    const module = required();
    const sessionId = String(++generationCounter);
    activeSession = sessionId;
    const events = new NativeEventEmitter(NativeModules.AtlasVulkan);
    let finished = false;
    let reportedError: Error | null = null;
    const token = events.addListener('AtlasVulkanToken', (event: {sessionId: string; text: string}) => {
      if (!finished && activeSession === sessionId && event.sessionId === sessionId) {
        onToken(event.text);
      }
    });
    const failure = events.addListener('AtlasVulkanError', (event: {sessionId: string; text: string}) => {
      if (event.sessionId === sessionId) reportedError = new Error(event.text || 'Vulkan generation failed');
    });
    const end = events.addListener('AtlasVulkanEnd', (_event: {sessionId: string}) => {
      // The native promise remains the source of completion; events only stream text.
    });
    try {
      await module.generate(prompt, maxTokens, sessionId);
      if (reportedError) throw reportedError;
    } finally {
      finished = true;
      token.remove();
      failure.remove();
      end.remove();
      if (activeSession === sessionId) activeSession = null;
    }
  },
  async interrupt(): Promise<void> {
    if (activeSession) await required().interrupt(activeSession);
  },
  async unload(): Promise<void> {
    if (activeSession) await this.interrupt();
    await required().unload();
  },
};
