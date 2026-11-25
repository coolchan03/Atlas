// Browser engine: llama.cpp compiled to WebAssembly (wllama). Runs any GGUF on the CPU (SIMD, multi
// threaded when the page is cross-origin isolated). The WebGPU engine (webgpuBackend.ts) is preferred
// when the user picks a GPU model; this one is the "any GGUF" path.
import { fs, norm } from '../../host/fs';
import { splitReasoning } from './reasoning';
import {
  emptyResult, type ChatMessage, type CompletionParams, type CompletionResult, type LlmBackend, type LlmSession,
  type LoadParams, type SessionInfo, type TokenEvent,
} from './types';

type WllamaMod = typeof import('@wllama/wllama');

const flatten = (m: ChatMessage): { role: 'system' | 'user' | 'assistant'; content: string } => ({
  role: m.role === 'tool' ? 'user' : (m.role as 'system' | 'user' | 'assistant'),
  content:
    typeof m.content === 'string'
      ? m.role === 'tool' ? `[tool result]\n${m.content}` : m.content
      : (m.content ?? []).map((p) => (p.type === 'text' ? p.text ?? '' : '')).join('\n'),
});

const SAMPLERS = ['top_k', 'typ_p', 'top_p', 'min_p', 'temperature'];

class WllamaSession implements LlmSession {
  info: SessionInfo;
  private abort: AbortController | null = null;
  private busy: Promise<unknown> = Promise.resolve();
  constructor(private w: InstanceType<WllamaMod['Wllama']>, info: SessionInfo, private embeddings: boolean) {
    this.info = info;
  }

  async completion(p: CompletionParams, onToken?: (e: TokenEvent) => void): Promise<CompletionResult> {
    const run = async (): Promise<CompletionResult> => {
      const ctl = (this.abort = new AbortController());
      const res = emptyResult();
      const stops = (p.stop ?? []).filter(Boolean);
      const t0 = performance.now();
      let tFirst = 0;
      let text = '';
      let stoppedWord = '';
      const startsThinking = false;
      const messages = (p.messages ?? [{ role: 'user', content: p.prompt ?? '' } as ChatMessage]).map(flatten);
      if (p.tools?.length && messages[0]?.role === 'system') {
        messages[0].content += `\n\nTools available (call with <tool_call>{"name":...,"arguments":{...}}</tool_call>):\n${JSON.stringify(p.tools)}`;
      }
      const sampling = {
        temp: p.temperature ?? 0.7,
        top_k: p.top_k ?? 40,
        top_p: p.top_p ?? 0.95,
        min_p: p.min_p ?? 0.05,
        penalty_repeat: p.penalty_repeat ?? 1.1,
        penalty_freq: p.penalty_freq,
        penalty_present: p.penalty_present,
        samplers_sequence: SAMPLERS,
        grammar: p.grammar as string | undefined,
      };
      try {
        const opts = {
          nPredict: p.n_predict && p.n_predict > 0 ? p.n_predict : -1,
          sampling,
          useCache: true,
          abortSignal: ctl.signal,
          onNewToken: (_tok: number, piece: Uint8Array, current: string) => {
            if (!tFirst) tFirst = performance.now();
            text = current;
            res.tokens_predicted++;
            const hit = stops.find((s) => text.includes(s));
            if (hit) {
              stoppedWord = hit;
              text = text.slice(0, text.indexOf(hit));
              ctl.abort();
            }
            const sp = splitReasoning(text, startsThinking);
            onToken?.({ token: new TextDecoder().decode(piece), content: sp.content, reasoning_content: sp.reasoning });
          },
        };
        const out = await (this.w as any).createChatCompletion(messages, opts);
        if (typeof out === 'string' && !text) text = out;
      } catch (e: any) {
        if (e?.name !== 'WllamaAbortError' && e?.name !== 'AbortError' && !ctl.signal.aborted) {
          if (String(e?.message ?? e).includes('kv_cache') || e?.type === 'kv_cache_full') res.context_full = true;
          else throw e;
        }
      }
      const t1 = performance.now();
      const sp = splitReasoning(text, startsThinking);
      res.text = text;
      res.content = sp.content;
      res.reasoning_content = sp.reasoning;
      res.stopped_word = stoppedWord;
      res.interrupted = ctl.signal.aborted && !stoppedWord;
      res.stopped_eos = !ctl.signal.aborted && !res.context_full && !(p.n_predict && res.tokens_predicted >= p.n_predict);
      res.stopped_limit = p.n_predict && res.tokens_predicted >= p.n_predict ? 1 : 0;
      res.truncated = res.stopped_limit === 1;
      res.timings = {
        prompt_n: res.tokens_evaluated,
        prompt_ms: tFirst ? tFirst - t0 : 0,
        prompt_per_second: 0,
        predicted_n: res.tokens_predicted,
        predicted_ms: tFirst ? t1 - tFirst : 0,
        predicted_per_second: tFirst && t1 > tFirst ? (res.tokens_predicted * 1000) / (t1 - tFirst) : 0,
      };
      this.abort = null;
      return res;
    };
    const job = this.busy.then(run, run);
    this.busy = job.catch(() => undefined);
    return job;
  }
  async stop() {
    this.abort?.abort();
  }
  tokenize(text: string) {
    return this.w.tokenize(text);
  }
  async detokenize(tokens: number[]) {
    return this.w.detokenize(tokens, true) as unknown as Promise<string>;
  }
  async embedding(text: string) {
    if (!this.embeddings) throw new Error('This model was not loaded for embeddings');
    return (await this.w.createEmbedding(text)) as number[];
  }
  async initMultimodal() {
    return false; // vision needs the desktop engine; the browser WASM build is text only
  }
  async releaseMultimodal() {}
  async release() {
    this.abort?.abort();
    await this.w.exit().catch(() => undefined);
  }
}

let wasmUrls: Promise<Record<string, string>> | null = null;
function assetPaths() {
  return (wasmUrls ??= (async () => ({
    'single-thread/wllama.wasm': (await import('@wllama/wllama/esm/single-thread/wllama.wasm?url')).default,
    'multi-thread/wllama.wasm': (await import('@wllama/wllama/esm/multi-thread/wllama.wasm?url')).default,
  }))());
}

export const wllamaBackend: LlmBackend = {
  id: 'wllama',
  supports: (p) => typeof WebAssembly !== 'undefined' && /\.gguf$/i.test(p.model),
  async load(p, onProgress) {
    const mod: WllamaMod = await import('@wllama/wllama');
    const w = new mod.Wllama((await assetPaths()) as any, { logger: mod.LoggerWithoutDebug, allowOffline: true } as any);
    onProgress?.(1);
    const file = await fs().getFile(norm(p.model));
    // The file is handed over as a Blob: wllama streams it into the WASM heap in chunks.
    const embeddings = !!p.embedding;
    const hw = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    await w.loadModel([file], {
      n_ctx: p.n_ctx ?? 2048,
      n_batch: p.n_batch ?? 512,
      n_threads: Math.min(p.n_threads ?? hw, hw),
      embeddings,
      pooling_type: embeddings ? 'LLAMA_POOLING_TYPE_MEAN' : undefined,
      flash_attn: false,
      cache_type_k: (p.cache_type_k as any) === 'q8_0' ? 'q8_0' : 'f16',
      cache_type_v: (p.cache_type_v as any) === 'q8_0' ? 'q8_0' : 'f16',
    } as any);
    onProgress?.(100);
    const ctx = w.getLoadedContextInfo();
    const multi = w.isMultithread();
    const info: SessionInfo = {
      engine: 'wllama',
      backend: multi ? 'WASM SIMD (multi-thread)' : 'WASM SIMD',
      gpu: false,
      devices: [],
      reasonNoGPU: 'The browser engine runs on the CPU. For GPU speed use a WebGPU model, or the Windows app.',
      nCtx: ctx.n_ctx,
      nLayers: ctx.n_layer,
      gpuLayers: 0,
      metadata: ctx.metadata ?? {},
      vision: false,
      audio: false,
    };
    return new WllamaSession(w, info, embeddings);
  },
};
