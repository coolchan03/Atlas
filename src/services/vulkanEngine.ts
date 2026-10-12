import { NativeEventEmitter, NativeModules } from 'react-native';

/** Experimental text-only Vulkan engine. Never substitutes for llama.rn silently. */
type Backend = { name: string; description: string; type: string };
export type VulkanSamplingSettings = {
  temperature?: number; topK?: number; topP?: number; minP?: number;
  repeatPenalty?: number; stop?: string[];
};
type VulkanModule = {
  listBackends(): Promise<Backend[]>;
  loadModel(path: string, gpuLayers: number, context: number, threads: number): Promise<string>;
  activeBackend(): Promise<string>;
  formatChat(messagesJson: string): Promise<string>;
  tokenize(text: string): Promise<number[]>;
  generate(prompt: string, maxTokens: number, sessionId: string, samplingJson: string): Promise<boolean>;
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
  async formatChat(messages: Array<{ role: string; content: string }>): Promise<string> {
    return required().formatChat(JSON.stringify(messages));
  },
  async tokenize(text: string): Promise<number[]> {
    return required().tokenize(text);
  },
  async generate(prompt: string, maxTokens: number, onToken: (text: string) => void,
    sampling: VulkanSamplingSettings = {}): Promise<void> {
    if (activeSession) throw new Error('Vulkan generation is already active');
    const module = required();
    const sessionId = String(++generationCounter);
    activeSession = sessionId;
    const subscriptions: Array<{ remove(): void }> = [];
    let finished = false;
    let reportedError: Error | null = null;
    try {
      // Listener registration can fail (for example during RN bridge teardown).
      // Always release the session lock, even if no native generation was started.
      const events = new NativeEventEmitter(NativeModules.AtlasVulkan);
      subscriptions.push(events.addListener('AtlasVulkanToken', (event: {sessionId: string; text: string}) => {
        if (finished || activeSession !== sessionId || event.sessionId !== sessionId || reportedError) return;
        try {
          onToken(event.text);
        } catch (error) {
          reportedError = error instanceof Error ? error : new Error(String(error));
          // Do not throw from a React Native event listener: cancel native work,
          // then surface the callback failure through the generation promise.
          void module.interrupt(sessionId).catch(() => {});
        }
      }));
      subscriptions.push(events.addListener('AtlasVulkanError', (event: {sessionId: string; text: string}) => {
        if (event.sessionId === sessionId) reportedError = new Error(event.text || 'Vulkan generation failed');
      }));
      await module.generate(prompt, maxTokens, sessionId, JSON.stringify(sampling));
      if (reportedError) throw reportedError;
    } finally {
      finished = true;
      for (const subscription of subscriptions) subscription.remove();
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
