/**
 * Direct Claude Messages API provider.
 * API keys remain in Android Keychain via RemoteServerManager, never in Zustand.
 * The host is pinned to the official Anthropic endpoint to prevent key exfiltration.
 */
import type { Message } from '../../types';
import type { LLMProvider, ProviderType, ProviderCapabilities, GenerationOptions, StreamCallbacks } from './types';
import { createStreamingRequest, parseAnthropicMessage } from '../httpClient';
import { useAppStore } from '../../stores/appStore';

const CLAUDE_HOST = 'https://api.anthropic.com';
const CLAUDE_VERSION = '2023-06-01';

export function assertClaudeEndpoint(raw: string): string {
  const value = (raw || '').trim().replace(/\/+$/, '');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'api.anthropic.com' || url.port ||
      (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash ||
      url.username || url.password) {
    throw new Error('Direct Claude API connections require https://api.anthropic.com');
  }
  return CLAUDE_HOST;
}

export interface ClaudeToolCall { id: string; name: string; arguments: string }
type ClaudeBlock = {
  type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>;
  tool_use_id?: string; content?: string;
};
type ClaudeMessage = { role: 'user' | 'assistant'; content: string | ClaudeBlock[] };
type ClaudeRequest = { model: string; max_tokens: number; messages: ClaudeMessage[]; system?: string;
  stream: true; tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  temperature?: number; top_p?: number };

function parseToolInput(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    return (value && typeof value === 'object' && !Array.isArray(value))
      ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

/** Pure conversion so malformed tool messages can be tested without network calls. */
export function toClaudeMessages(messages: Message[], systemPrompt = ''): {
  system: string; messages: ClaudeMessage[];
} {
  const system: string[] = [];
  const out: ClaudeMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      if (msg.content.trim()) system.push(msg.content);
    } else if (msg.role === 'tool') {
      // Anthropic tool results are user content blocks, not a "tool" role.
      if (!msg.toolCallId) continue;
      const previous = out[out.length - 1];
      const result: ClaudeBlock = { type: 'tool_result', tool_use_id: msg.toolCallId, content: msg.content || '' };
      if (previous?.role === 'user' && Array.isArray(previous.content) &&
          previous.content.length > 0 && previous.content.every(block => block.type === 'tool_result')) {
        previous.content.push(result);
      } else {
        out.push({ role: 'user', content: [result] });
      }
    } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const blocks: ClaudeBlock[] = [];
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
      for (const tc of msg.toolCalls) {
        if (!tc.name || !tc.id) continue;
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parseToolInput(tc.arguments) });
      }
      out.push({ role: 'assistant', content: blocks.length ? blocks : String(msg.content || '') });
    } else {
      out.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: String(msg.content || '') });
    }
  }
  if (!system.length && systemPrompt) system.push(systemPrompt);
  return { system: system.join('\n\n'), messages: out.length ? out : [{ role: 'user', content: 'Hello' }] };
}

export class AnthropicProvider implements LLMProvider {
  readonly type: ProviderType = 'anthropic';
  readonly capabilities: ProviderCapabilities = {
    supportsVision: false, supportsToolCalling: true, supportsThinking: false,
    providerName: 'Claude API',
  };
  private endpoint: string;
  private apiKey: string;
  private modelId = '';
  private controller: AbortController | null = null;

  constructor(public readonly id: string, endpoint: string, apiKey?: string) {
    this.endpoint = assertClaudeEndpoint(endpoint);
    this.apiKey = apiKey || '';
  }
  updateConfig(options: { endpoint?: string; apiKey?: string }): void {
    if (options.endpoint !== undefined) this.endpoint = assertClaudeEndpoint(options.endpoint);
    if (options.apiKey !== undefined) this.apiKey = options.apiKey;
  }
  async loadModel(modelId: string): Promise<void> { this.modelId = modelId; }
  async unloadModel(): Promise<void> { this.modelId = ''; await this.stopGeneration(); }
  isModelLoaded(): boolean { return !!this.modelId; }
  getLoadedModelId(): string | null { return this.modelId || null; }
  async getTokenCount(text: string): Promise<number> { return Math.ceil(text.length / 4); }
  async isReady(): Promise<boolean> { return !!this.apiKey && !!this.modelId; }
  async stopGeneration(): Promise<void> { this.controller?.abort(); this.controller = null; }
  async dispose(): Promise<void> { await this.stopGeneration(); this.apiKey = ''; this.modelId = ''; }

  async generate(messages: Message[], options: GenerationOptions, callbacks: StreamCallbacks): Promise<void> {
    if (!await this.isReady()) {
      callbacks.onError(new Error('Claude API key and model are required.'));
      return;
    }
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const defaults = useAppStore.getState().settings.systemPrompt || '';
    const converted = toClaudeMessages(messages, options.systemPrompt || defaults);
    const request: ClaudeRequest = {
      model: this.modelId, max_tokens: Math.max(128, Math.min(16384, options.maxTokens || 4096)),
      messages: converted.messages, stream: true,
      ...(converted.system ? { system: converted.system } : {}),
    };
    if (options.temperature !== undefined) request.temperature = options.temperature;
    if (options.topP !== undefined) request.top_p = options.topP;
    if (options.tools?.length) {
      request.tools = options.tools.filter(t => !!t.function?.name).map(t => ({
        name: t.function.name,
        description: t.function.description || '',
        input_schema: t.function.parameters as Record<string, unknown>,
      }));
    }
    const calls = new Map<number, { id: string; name: string; args: string }>();
    let fullText = '';
    let completed = false;
    let streamError: string | null = null;
    const finish = () => {
      if (completed || streamError || signal.aborted) return;
      const toolCalls: ClaudeToolCall[] = [];
      for (const call of calls.values()) {
        if (!call.id || !call.name) continue;
        // Never pass malformed partial tool input to Atlas's executor.
        let args: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(call.args || '{}');
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Tool arguments must be an object');
          }
          args = parsed as Record<string, unknown>;
        } catch {
          callbacks.onError(new Error('Claude returned invalid tool arguments'));
          return;
        }
        toolCalls.push({ id: call.id, name: call.name, arguments: JSON.stringify(args) });
      }
      completed = true;
      callbacks.onComplete({
        content: fullText,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        meta: { gpu: false, gpuBackend: 'Remote' },
      });
    };
    try {
      await createStreamingRequest(this.endpoint + '/v1/messages', {
        body: request,
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': CLAUDE_VERSION },
        signal, timeout: 300000,
      }, event => {
        const message = parseAnthropicMessage(event) as any;
        if (!message) return;
        if (message.type === 'error') {
          streamError = message.error?.message || 'Claude API error';
        } else if (message.type === 'content_block_start' &&
                   message.content_block?.type === 'tool_use') {
          calls.set(message.index, {
            id: message.content_block.id,
            name: message.content_block.name,
            args: Object.keys(message.content_block.input || {}).length
              ? JSON.stringify(message.content_block.input) : '',
          });
        } else if (message.type === 'content_block_delta') {
          if (message.delta?.type === 'text_delta') {
            const chunk = message.delta.text || '';
            fullText += chunk;
            callbacks.onToken(chunk);
          } else if (message.delta?.type === 'input_json_delta') {
            const call = calls.get(message.index);
            if (call) call.args += message.delta.partial_json || '';
          }
        } else if (message.type === 'message_stop' && !streamError) {
          finish();
        }
      });
      if (streamError) {
        if (!completed) callbacks.onError(new Error(streamError));
        return;
      }
      if (!signal.aborted) finish();
    } catch (error) {
      if (!signal.aborted) callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (this.controller?.signal === signal) this.controller = null;
    }
  }
}
