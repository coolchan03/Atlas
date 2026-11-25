// Windows app engine: the real llama.cpp `llama-server` (CPU / Vulkan / CUDA build bundled with the
// installer) run as a child process by the Electron main process. The renderer talks to it over loopback
// HTTP using the OpenAI-compatible API, which gives proper tool calls, reasoning split and vision.
import { fs, norm } from '../../host/fs';
import {
  emptyResult, type ChatMessage, type CompletionParams, type CompletionResult, type LlmBackend, type LlmSession,
  type LoadParams, type SessionInfo, type TokenEvent, type ToolCall,
} from './types';

interface HostLlama {
  start(opts: Record<string, unknown>): Promise<{ id: string; port: number; backend: string; devices: string[]; nLayers?: number; gpuLayers: number; reasonNoGPU?: string; metadata?: Record<string, string>; nCtx: number; vision: boolean }>;
  stop(id: string): Promise<void>;
  onProgress?(cb: (id: string, percent: number) => void): () => void;
  capabilities(): Promise<{ available: boolean; backends: string[] }>;
}
const host = (): HostLlama | undefined => (globalThis as any).atlasHost?.llama;

const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

async function prepareMessages(messages: ChatMessage[]) {
  const out: unknown[] = [];
  for (const m of messages) {
    if (!Array.isArray(m.content)) {
      out.push(m);
      continue;
    }
    const parts: unknown[] = [];
    for (const part of m.content) {
      if (part.type === 'image_url' && part.image_url?.url && !/^(data:|https?:)/.test(part.image_url.url)) {
        const bytes = await fs().readFile(norm(part.image_url.url));
        const ext = (part.image_url.url.split('.').pop() || 'png').toLowerCase();
        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        parts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64(bytes)}` } });
      } else if (part.type === 'input_audio' && part.input_audio?.url) {
        const bytes = await fs().readFile(norm(part.input_audio.url));
        parts.push({ type: 'input_audio', input_audio: { data: b64(bytes), format: part.input_audio.format ?? 'wav' } });
      } else parts.push(part);
    }
    out.push({ ...m, content: parts });
  }
  return out;
}

class ServerSession implements LlmSession {
  private abort: AbortController | null = null;
  private busy: Promise<unknown> = Promise.resolve();
  info: SessionInfo;
  constructor(private id: string, private base: string, info: SessionInfo, private params: LoadParams) {
    this.info = info;
  }

  async completion(p: CompletionParams, onToken?: (e: TokenEvent) => void): Promise<CompletionResult> {
    const run = async () => {
      const ctl = (this.abort = new AbortController());
      const res = emptyResult();
      const body: Record<string, unknown> = {
        messages: p.messages ? await prepareMessages(p.messages) : [{ role: 'user', content: p.prompt ?? '' }],
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: p.n_predict && p.n_predict > 0 ? p.n_predict : -1,
        temperature: p.temperature,
        top_k: p.top_k,
        top_p: p.top_p,
        min_p: p.min_p,
        repeat_penalty: p.penalty_repeat,
        frequency_penalty: p.penalty_freq,
        presence_penalty: p.penalty_present,
        seed: p.seed,
        stop: p.stop,
        grammar: p.grammar,
        cache_prompt: true,
        timings_per_token: false,
      };
      if (p.tools?.length) {
        body.tools = p.tools;
        body.tool_choice = p.tool_choice ?? 'auto';
      }
      if (p.enable_thinking !== undefined) body.chat_template_kwargs = { enable_thinking: p.enable_thinking };
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      let content = '';
      let reasoning = '';
      const calls: ToolCall[] = [];
      let finish = '';
      try {
        const r = await fetch(`${this.base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
        if (!r.ok || !r.body) {
          const msg = await r.text().catch(() => '');
          if (/context|exceed|too long/i.test(msg)) res.context_full = true;
          else throw new Error(`llama-server ${r.status}: ${msg.slice(0, 300)}`);
        } else {
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') continue;
              let j: any;
              try { j = JSON.parse(data); } catch { continue; }
              const ch = j.choices?.[0];
              const d = ch?.delta ?? {};
              let piece = '';
              if (typeof d.content === 'string' && d.content) { content += d.content; piece = d.content; }
              if (typeof d.reasoning_content === 'string' && d.reasoning_content) { reasoning += d.reasoning_content; piece = piece || d.reasoning_content; }
              for (const tc of d.tool_calls ?? []) {
                const i = tc.index ?? 0;
                calls[i] ??= { type: 'function', id: tc.id, function: { name: '', arguments: '' } };
                if (tc.id) calls[i].id = tc.id;
                if (tc.function?.name) calls[i].function.name += tc.function.name;
                if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
              }
              if (piece || d.tool_calls) {
                res.tokens_predicted++;
                onToken?.({ token: piece || ' ', content, reasoning_content: reasoning, tool_calls: calls.length ? calls.filter(Boolean) : undefined });
              }
              if (ch?.finish_reason) finish = ch.finish_reason;
              if (j.usage) {
                res.tokens_evaluated = j.usage.prompt_tokens ?? 0;
                res.tokens_predicted = j.usage.completion_tokens ?? res.tokens_predicted;
              }
              if (j.timings) {
                const t = j.timings;
                res.timings = {
                  prompt_n: t.prompt_n ?? 0, prompt_ms: t.prompt_ms ?? 0, prompt_per_second: t.prompt_per_second ?? 0,
                  predicted_n: t.predicted_n ?? 0, predicted_ms: t.predicted_ms ?? 0, predicted_per_second: t.predicted_per_second ?? 0,
                };
              }
            }
          }
        }
      } catch (e: any) {
        if (!ctl.signal.aborted) throw e;
      }
      res.text = content;
      res.content = content;
      res.reasoning_content = reasoning;
      res.tool_calls = calls.filter(Boolean);
      res.interrupted = ctl.signal.aborted;
      res.stopped_limit = finish === 'length' ? 1 : 0;
      res.truncated = finish === 'length';
      res.stopped_eos = finish === 'stop';
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
  async tokenize(text: string) {
    const r = await fetch(`${this.base}/tokenize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text }) });
    return ((await r.json()).tokens ?? []) as number[];
  }
  async detokenize(tokens: number[]) {
    const r = await fetch(`${this.base}/detokenize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tokens }) });
    return ((await r.json()).content ?? '') as string;
  }
  async embedding(text: string) {
    const r = await fetch(`${this.base}/v1/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: text }) });
    const j = await r.json();
    return (j.data?.[0]?.embedding ?? []) as number[];
  }
  async initMultimodal(path: string, useGpu = true) {
    const h = host();
    if (!h) return false;
    // The server needs the projector at start-up: restart it with --mmproj.
    await h.stop(this.id);
    const s = await h.start({ ...this.params, mmproj: norm(path), mmprojGpu: useGpu });
    this.id = s.id;
    this.base = `http://127.0.0.1:${s.port}`;
    this.info = { ...this.info, vision: s.vision, backend: s.backend };
    return s.vision;
  }
  async releaseMultimodal() {
    if (!this.info.vision) return;
    const h = host();
    if (!h) return;
    await h.stop(this.id);
    const { mmproj: _m, mmprojGpu: _g, ...rest } = this.params as any;
    const s = await h.start(rest);
    this.id = s.id;
    this.base = `http://127.0.0.1:${s.port}`;
    this.info = { ...this.info, vision: false };
  }
  async release() {
    this.abort?.abort();
    await host()?.stop(this.id);
  }
}

export const serverBackend: LlmBackend = {
  id: 'llama-server',
  supports: (p) => !!host() && /\.gguf$/i.test(p.model),
  async load(p, onProgress) {
    const h = host()!;
    const off = h.onProgress?.((_id, pct) => onProgress?.(pct));
    try {
      const s = await h.start({ ...p, model: norm(p.model) });
      const info: SessionInfo = {
        engine: 'llama-server',
        backend: s.backend,
        gpu: s.gpuLayers > 0,
        devices: s.devices,
        reasonNoGPU: s.reasonNoGPU ?? '',
        nCtx: s.nCtx,
        nLayers: s.nLayers,
        gpuLayers: s.gpuLayers,
        metadata: s.metadata ?? {},
        vision: s.vision,
        audio: false,
      };
      return new ServerSession(s.id, `http://127.0.0.1:${s.port}`, info, p);
    } finally {
      off?.();
    }
  },
};
