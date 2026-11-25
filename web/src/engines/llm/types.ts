// The contract every text-generation engine satisfies on the web / desktop builds. The llama.rn shim
// speaks to this and nothing else, so adding an engine (WebGPU, a desktop server, a remote runtime)
// needs no change in the app.
export interface LoadParams {
  /** Virtual path of the GGUF file (or, for WebGPU engines, a catalog id). */
  model: string;
  n_ctx?: number;
  n_batch?: number;
  n_threads?: number;
  n_gpu_layers?: number;
  embedding?: boolean;
  flash_attn?: boolean;
  cache_type_k?: string;
  cache_type_v?: string;
  use_mmap?: boolean;
  [k: string]: unknown;
}

export interface ChatMessagePart {
  type: 'text' | 'image_url' | 'input_audio';
  text?: string;
  image_url?: { url: string };
  input_audio?: { data?: string; url?: string; format?: string };
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatMessagePart[] | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

export interface CompletionParams {
  messages?: ChatMessage[];
  prompt?: string;
  n_predict?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  penalty_repeat?: number;
  penalty_freq?: number;
  penalty_present?: number;
  seed?: number;
  stop?: string[];
  grammar?: string;
  tools?: unknown[];
  tool_choice?: string;
  enable_thinking?: boolean;
  reasoning_format?: string;
  ctx_shift?: boolean;
  [k: string]: unknown;
}

export interface TokenEvent {
  token: string;
  /** Everything generated so far with reasoning removed. */
  content: string;
  /** Reasoning ("thinking") text so far. */
  reasoning_content: string;
  tool_calls?: ToolCall[];
}
export interface ToolCall {
  type: 'function';
  id?: string;
  function: { name: string; arguments: string };
}

export interface CompletionResult {
  text: string;
  content: string;
  reasoning_content: string;
  tool_calls: ToolCall[];
  tokens_predicted: number;
  tokens_evaluated: number;
  truncated: boolean;
  stopped_eos: boolean;
  stopped_limit: number;
  stopped_word: string;
  interrupted: boolean;
  context_full: boolean;
  timings: { prompt_n: number; prompt_ms: number; prompt_per_second: number; predicted_n: number; predicted_ms: number; predicted_per_second: number };
}

export interface SessionInfo {
  engine: string;
  /** "WebGPU", "WASM SIMD", "Vulkan", "CUDA", "CPU" ... shown in the model status. */
  backend: string;
  gpu: boolean;
  devices: string[];
  reasonNoGPU: string;
  nCtx: number;
  nLayers?: number;
  gpuLayers: number;
  metadata: Record<string, string>;
  vision: boolean;
  audio: boolean;
}

export interface LlmSession {
  readonly info: SessionInfo;
  completion(params: CompletionParams, onToken?: (e: TokenEvent) => void): Promise<CompletionResult>;
  stop(): Promise<void>;
  tokenize(text: string): Promise<number[]>;
  detokenize(tokens: number[]): Promise<string>;
  embedding(text: string): Promise<number[]>;
  /** Attach a multimodal projector (vision / audio). Resolves false when this engine cannot. */
  initMultimodal(path: string, useGpu?: boolean): Promise<boolean>;
  releaseMultimodal(): Promise<void>;
  release(): Promise<void>;
}

export interface LlmBackend {
  readonly id: string;
  /** Can this backend load this model in this environment right now? */
  supports(params: LoadParams): Promise<boolean> | boolean;
  load(params: LoadParams, onProgress?: (percent: number) => void): Promise<LlmSession>;
}

export const emptyResult = (): CompletionResult => ({
  text: '', content: '', reasoning_content: '', tool_calls: [], tokens_predicted: 0, tokens_evaluated: 0, truncated: false,
  stopped_eos: false, stopped_limit: 0, stopped_word: '', interrupted: false, context_full: false,
  timings: { prompt_n: 0, prompt_ms: 0, prompt_per_second: 0, predicted_n: 0, predicted_ms: 0, predicted_per_second: 0 },
});
