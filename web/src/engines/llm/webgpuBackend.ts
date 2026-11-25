// WebGPU text engine: WebLLM (MLC) running the model on the GPU in the browser / in the Windows app's renderer.
import { fs, norm } from '../../host/fs';
import { splitReasoning } from './reasoning';
import { emptyResult, type ChatMessage, type CompletionParams, type CompletionResult, type LlmBackend, type LlmSession, type SessionInfo, type TokenEvent, type ToolCall } from './types';

const MARKER = 'atlas-web-webllm:v1';
export async function writeWebLlmMarker(path: string, modelId: string) {
  const head = new TextEncoder().encode(JSON.stringify({ marker: MARKER, id: modelId }) + '\n');
  const out = new Uint8Array(10 * 1024 * 1024 + 4096); // the app rejects model files under 10 MB
  out.set(head);
  await fs().writeFile(path, out);
}
async function readMarker(path: string): Promise<string | null> {
  try {
    const head = new TextDecoder().decode(await fs().readRange(norm(path), 0, 300));
    const j = JSON.parse(head.split('\n')[0]);
    return j.marker === MARKER ? (j.id as string) : null;
  } catch { return null; }
}

type Engine = any;
const engines = new Map<string, Promise<Engine>>();
/** Fetches (first time) and loads a WebLLM model. Weights are cached by the browser, so this works offline afterwards. */
export async function loadWebLlm(modelId: string, onProgress?: (fraction: number) => void, ctx = 4096): Promise<Engine> {
  const key = `${modelId}:${ctx}`;
  let p = engines.get(key);
  if (!p) {
    p = (async () => {
      if (!(navigator as any).gpu) throw new Error('This browser has no WebGPU. Use a recent Chrome or Edge, or the Windows app.');
      const webllm = await import('@mlc-ai/web-llm');
      return webllm.CreateMLCEngine(modelId, { initProgressCallback: (r: { progress: number }) => onProgress?.(Math.min(0.995, r.progress)) }, { context_window_size: ctx });
    })();
    p.catch(() => engines.delete(key));
    engines.set(key, p);
  }
  return p;
}

const textOf = (m: ChatMessage): string => (typeof m.content === 'string' ? m.content ?? '' : (m.content ?? []).map((x) => (x.type === 'text' ? x.text ?? '' : '')).join('\n'));

class WebLlmSession implements LlmSession {
  private busy: Promise<unknown> = Promise.resolve();
  constructor(private engine: Engine, public info: SessionInfo) {}
  async completion(p: CompletionParams, onToken?: (e: TokenEvent) => void): Promise<CompletionResult> {
    const run = async (): Promise<CompletionResult> => {
      const res = emptyResult();
      const messages = (p.messages ?? [{ role: 'user', content: p.prompt ?? '' } as ChatMessage]).map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: textOf(m) }));
      const req: any = {
        messages, stream: true, stream_options: { include_usage: true },
        max_tokens: p.n_predict && p.n_predict > 0 ? p.n_predict : undefined,
        temperature: p.temperature, top_p: p.top_p, frequency_penalty: p.penalty_freq, presence_penalty: p.penalty_present,
        repetition_penalty: p.penalty_repeat, stop: p.stop?.length ? p.stop.slice(0, 4) : undefined,
      };
      for (const k of Object.keys(req)) if (req[k] === undefined) delete req[k];
      let text = '';
      let finish = '';
      let interrupted = false;
      const calls: ToolCall[] = [];
      const t0 = performance.now();
      let tFirst = 0;
      this.stopFlag = () => { interrupted = true; this.engine.interruptGenerate(); };
      try {
        const stream = await this.engine.chat.completions.create(req);
        for await (const chunk of stream) {
          const d = chunk.choices?.[0]?.delta;
          if (d?.content) {
            if (!tFirst) tFirst = performance.now();
            text += d.content;
            res.tokens_predicted++;
            const sp = splitReasoning(text);
            onToken?.({ token: d.content, content: sp.content, reasoning_content: sp.reasoning });
          }
          for (const tc of d?.tool_calls ?? []) {
            const i = tc.index ?? 0;
            calls[i] ??= { type: 'function', id: tc.id, function: { name: '', arguments: '' } };
            if (tc.function?.name) calls[i].function.name += tc.function.name;
            if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
          }
          if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
          if (chunk.usage) { res.tokens_evaluated = chunk.usage.prompt_tokens ?? 0; res.tokens_predicted = chunk.usage.completion_tokens ?? res.tokens_predicted; }
        }
      } catch (e: any) {
        if (!interrupted) {
          if (/context|window|exceed/i.test(String(e?.message))) res.context_full = true; else throw e;
        }
      }
      const t1 = performance.now();
      const sp = splitReasoning(text);
      res.text = text; res.content = sp.content; res.reasoning_content = sp.reasoning;
      res.tool_calls = calls.filter(Boolean);
      res.interrupted = interrupted; res.stopped_limit = finish === 'length' ? 1 : 0; res.truncated = finish === 'length'; res.stopped_eos = finish === 'stop';
      res.timings = { prompt_n: res.tokens_evaluated, prompt_ms: tFirst ? tFirst - t0 : 0, prompt_per_second: 0, predicted_n: res.tokens_predicted, predicted_ms: tFirst ? t1 - tFirst : 0, predicted_per_second: tFirst && t1 > tFirst ? (res.tokens_predicted * 1000) / (t1 - tFirst) : 0 };
      this.stopFlag = null;
      return res;
    };
    const job = this.busy.then(run, run);
    this.busy = job.catch(() => undefined);
    return job;
  }
  private stopFlag: (() => void) | null = null;
  async stop() { this.stopFlag?.(); }
  async tokenize(text: string) { return new Array(Math.ceil(text.length / 3.6)).fill(0); }
  async detokenize() { return ''; }
  async embedding(): Promise<number[]> { throw new Error('Embeddings are not available on WebGPU models.'); }
  async initMultimodal() { return false; }
  async releaseMultimodal() {}
  async release() { try { await this.engine.unload(); } catch { /* gone */ } for (const [k, v] of engines) if ((await v.catch(() => null)) === this.engine) engines.delete(k); }
}

export const webgpuBackend: LlmBackend = {
  id: 'webllm',
  supports: async (p) => !p.embedding && !!(await readMarker(p.model)),
  async load(p, onProgress) {
    const id = (await readMarker(p.model))!;
    const ctx = Math.max(1024, Math.min(Number(p.n_ctx) || 4096, 8192));
    const engine = await loadWebLlm(id, (f) => onProgress?.(f * 100), ctx);
    let device = 'WebGPU adapter';
    try { const a: any = await (navigator as any).gpu.requestAdapter(); device = a?.info?.description || a?.info?.vendor || device; } catch { /* ok */ }
    onProgress?.(100);
    return new WebLlmSession(engine, {
      engine: 'webllm', backend: 'WebGPU', gpu: true, devices: [device], reasonNoGPU: '', nCtx: ctx, gpuLayers: 999,
      metadata: { 'general.architecture': id.split('-')[0].toLowerCase(), 'general.name': id }, vision: false, audio: false,
    });
  },
};
