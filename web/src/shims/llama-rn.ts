// llama.rn on the web / desktop: the same initLlama() + LlamaContext API over the engine layer in
// ../engines/llm (wllama in browsers, llama-server in the Windows app). The app never learns which.
import { loadSession, type LlmSession, type CompletionParams } from '../engines/llm';
import { WebEmitter } from '../native/registry';

export type RNLlamaOAICompatibleMessage = any;
export type RNLlamaMessagePart = any;

const logBus = new WebEmitter();
export const toggleNativeLog = async (_enabled: boolean) => undefined;
export const addNativeLogListener = (cb: (level: string, text: string) => void) => logBus.addListener('log', (e) => cb(e.level, e.text));
export const BuildInfo = { number: 'web', commit: 'atlas-web' };

let probe: Promise<any[]> | null = null;
export async function getBackendDevicesInfo(): Promise<any[]> {
  return (probe ??= (async () => {
    const out: any[] = [{ backend: 'CPU', type: 'cpu', deviceName: 'CPU', maxMemorySize: 0 }];
    const h = (globalThis as any).atlasHost?.llama;
    try {
      const caps = await h?.capabilities?.();
      for (const b of caps?.backends ?? []) if (b !== 'cpu') out.push({ backend: String(b).toUpperCase(), type: 'gpu', deviceName: String(b), maxMemorySize: 0 });
    } catch { /* optional */ }
    try {
      const gpu = await (navigator as any).gpu?.requestAdapter?.();
      if (gpu) out.push({ backend: 'WebGPU', type: 'gpu', deviceName: gpu.info?.description || gpu.info?.vendor || 'WebGPU adapter', maxMemorySize: Number(gpu.limits?.maxBufferSize ?? 0) });
    } catch { /* no WebGPU */ }
    return out;
  })());
}

let ids = 1;
class WebLlamaContext {
  id = ids++;
  gpu: boolean;
  reasonNoGPU: string;
  devices: string[];
  androidLib: string;
  model: Record<string, any>;
  private mm = false;
  constructor(private session: LlmSession, private params: any) {
    const i = session.info;
    this.gpu = i.gpu;
    this.reasonNoGPU = i.reasonNoGPU;
    this.devices = i.devices;
    this.androidLib = i.engine;
    const meta = i.metadata ?? {};
    this.model = {
      desc: meta['general.name'] ?? '', size: 0, nEmbd: 0, nParams: 0, isChatTemplateSupported: true, metadata: meta,
      backend: i.backend, engine: i.engine, filePath: params.model, modelPath: params.model, remote: false, loaded: true,
      chatTemplates: { llamaChat: true, minja: { default: true, defaultCaps: { tools: true, toolCalls: true, parallelToolCalls: false } } },
    };
  }
  async completion(params: CompletionParams, cb?: (d: any) => void) {
    return this.session.completion(params, cb ? (e) => cb({ token: e.token, content: e.content, reasoning_content: e.reasoning_content, tool_calls: e.tool_calls }) : undefined);
  }
  async stopCompletion() { await this.session.stop(); }
  async tokenize(text: string) { return { tokens: await this.session.tokenize(text), has_images: false }; }
  async detokenize(tokens: number[]) { return this.session.detokenize(tokens); }
  async embedding(text: string) { return { embedding: await this.session.embedding(text) }; }
  async rerank() { return []; }
  async clearCache(_all?: boolean) { return undefined; }
  async getFormattedChat(messages: any[]) { return messages.map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`).join('\n'); }
  async initMultimodal(o: { path: string; use_gpu?: boolean }) { return (this.mm = await this.session.initMultimodal(o.path, o.use_gpu)); }
  isMultimodalEnabled() { return this.mm; }
  async getMultimodalSupport() { return { vision: this.mm && this.session.info.vision, audio: this.mm && this.session.info.audio }; }
  async releaseMultimodal() { await this.session.releaseMultimodal(); this.mm = false; }
  async applyLoraAdapters() {}
  async removeLoraAdapters() {}
  async getLoadedLoraAdapters() { return []; }
  async bench() { return { speedPp: 0, speedTg: 0 }; }
  async release() { await this.session.release(); }
}
export type LlamaContext = WebLlamaContext;

export async function initLlama(params: any, onProgress?: (percent: number) => void): Promise<LlamaContext> {
  const session = await loadSession(params, onProgress);
  return new WebLlamaContext(session, params);
}
export async function releaseAllLlama() {}
