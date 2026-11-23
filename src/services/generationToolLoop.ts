/* eslint-disable max-lines */
/** Tool-calling generation loop. Extracted to keep generationService.ts under the max-lines limit. */
import { llmService } from './llm';
import { activeAgentOverrides } from '../stores/agentStore';
import type { StreamToken } from './llm';
import { liteRTService } from './litert';
import { useChatStore, useRemoteServerStore, useAppStore } from '../stores';
import { Message } from '../types';
import { getToolsAsOpenAISchema, executeToolCall } from './tools';
import { AVAILABLE_TOOLS } from './tools/registry';
import { withTimeout } from '../utils/withTimeout';
import { fileClaimNote } from './fileClaim';
import type { ToolCall, ToolResult } from './tools/types';
import { normalizeToolResult, toolErrorResult, toolResultModelContent } from './tools/toolResult';
import { modelInputImageUris, modelInputAudioUris } from './modelMedia';
import { getToolExtensions } from './tools/extensions';
import { Platform } from 'react-native';
import { selectRelevantTools } from './litertToolSelector';
import { isMcpEnabled } from './mcpContextBoost';
import { selectToolsByEmbedding } from './toolEmbeddingRouter';
import { providerRegistry } from './providers';
import { getActiveEngineService, isRemoteTextModelActive } from './engines';
import type { GenerationOptions, CompletionResult } from './providers/types';
import logger from '../utils/logger';
import { parseGemmaNativeToolCalls, parseToolCallsFromText } from './toolCallParsing';
import { buildDateContext, buildExactTimeNote, nowParts } from './toolLoopTime';
export { parseToolCallsFromText };
const MAX_TOOL_ITERATIONS = 3;
const MAX_TOTAL_TOOL_CALLS = 5;
// On-device: above this many tools, run a fast routing pass to pick the relevant ones
// before generating (small models can't fit many schemas in context). Tunable.
const TOOL_SELECTION_THRESHOLD = 5;
// MCP enabled: how many MCP/ext tools the hybrid router keeps for the prompt.
// Small enough to keep prefill fast, large enough to cover a multi-step request.
const MCP_TOOL_ROUTE_TOPK = 12;
// LiteRT runs the tool loop natively (automaticToolCalling), so the JS caps above don't
// apply to it. Bound the native loop here instead: once a single response exceeds this many
// tool calls we stop executing them and tell the model to answer, which prevents the KV cache
// from overflowing the (small, ~4096) context window mid-turn → degenerate output / crash.
const MAX_LITERT_TOOL_CALLS = 3;
type StreamChunk = string | StreamToken;
interface ToolLoopCallbacks {
  onToolCallStart?: (name: string, args: Record<string, any>) => void;
  onToolCallComplete?: (name: string, result: ToolResult) => void;
  onFirstToken?: () => void;
}
export interface ToolLoopContext {
  conversationId: string;
  messages: Message[];
  enabledToolIds: string[];
  projectId?: string;
  callbacks?: ToolLoopCallbacks;
  isAborted: () => boolean;
  onThinkingDone: () => void;
  onStream?: (data: StreamChunk) => void;
  onStreamReset?: () => void;
  onFinalResponse: (content: string) => void;
  /** Reports the tool names sent to the model this turn (built-in + routed MCP/ext). */
  onToolsRouted?: (names: string[]) => void;
  forceRemote?: boolean;
}
function normalizeStreamChunk(data: StreamChunk): StreamToken {
  return typeof data === 'string' ? { content: data } : data;
}
function getLastUserQuery(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i].role === 'user' && messages[i].content.trim()) return messages[i].content.trim();
  return '';
}
/**
 * The single defensive seam every tool execution funnels through. A tool that THROWS
 * (e.g. an MCP server that's down or disconnected) must NOT crash the turn; an empty
 * result must NOT be mistaken for success. We normalize EVERY outcome to a typed
 * ToolResult via the toolResult contract, so both the JS loop and the LiteRT native
 * handler behave identically: success/empty/error all become a typed result whose
 * model-facing string (toolResultModelContent) explicitly states failure/empty.
 */
/** A tool that has not answered by now is stopped and reported to the model as a failure, so the turn can go on. */
export const TOOL_TIMEOUT_MS = 3 * 60 * 1000;
/** Tools that legitimately run for minutes (they search and read many pages, or make media). */
const LONG_TOOL = /research|podcast|image|video|download|sync|backup/i;
export const toolTimeoutFor = (name: string): number => (LONG_TOOL.test(name) ? 10 * 60 * 1000 : TOOL_TIMEOUT_MS);

const BUILT_IN_TOOL_IDS = new Set(AVAILABLE_TOOLS.map((t) => t.id));

async function executeToolCallSafely(tc: ToolCall, enabledToolIds?: string[]): Promise<ToolResult> {
  const exts = getToolExtensions();
  const ext = exts.find(e => e.canHandle(tc.name));
  const start = Date.now();
  // Authorization at the execution boundary: a built-in tool the model asks for that is not enabled for this chat is refused,
  // even if the model invented the call (the tool list sent to the model is only a hint, not the permission).
  if (!ext && enabledToolIds && BUILT_IN_TOOL_IDS.has(tc.name) && !enabledToolIds.includes(tc.name)) {
    logger.warn(`[ToolLoop] refused "${tc.name}": not enabled for this chat`);
    return toolErrorResult(tc, new Error(`The "${tc.name}" tool is not enabled for this chat, so it was not run.`), start);
  }
  try {
    const controller = new AbortController();
    tc.signal = controller.signal;
    const raw = await withTimeout(Promise.resolve(ext ? ext.execute(tc) : executeToolCall(tc)), toolTimeoutFor(tc.name), { what: `The "${tc.name}" tool`, onTimeout: () => controller.abort() });
    return normalizeToolResult(tc, raw);
  } catch (err) {
    logger.error(`[ToolLoop] tool "${tc.name}" threw — surfacing as a typed error result`, err);
    return toolErrorResult(tc, err, start);
  }
}

async function executeToolCalls(ctx: ToolLoopContext, toolCalls: import('./tools/types').ToolCall[], loopMessages: Message[]): Promise<void> {
  const chatStore = useChatStore.getState();
  for (const tc of toolCalls) {
    if (ctx.isAborted()) break;
    // Small models often call web_search with empty args — use user's message as fallback
    if (tc.name === 'web_search' && (!tc.arguments.query || typeof tc.arguments.query !== 'string' || !tc.arguments.query.trim())) {
      const fallbackQuery = getLastUserQuery(loopMessages);
      if (fallbackQuery) {
        tc.arguments = { ...tc.arguments, query: fallbackQuery };
      }
    }
    if (ctx.projectId) tc.context = { projectId: ctx.projectId };
    ctx.callbacks?.onToolCallStart?.(tc.name, tc.arguments);
    const result = await executeToolCallSafely(tc, ctx.enabledToolIds);
    ctx.callbacks?.onToolCallComplete?.(tc.name, result);
    const toolResultMsg: Message = {
      id: `tool-result-${Date.now()}-${tc.id || tc.name}`, role: 'tool',
      content: toolResultModelContent(result), timestamp: Date.now(),
      toolCallId: tc.id, toolName: tc.name, generationTimeMs: result.durationMs,
    };
    loopMessages.push(toolResultMsg);
    chatStore.addMessage(ctx.conversationId, toolResultMsg);
  }
}
const MAX_LLM_RETRIES = 4;
const RETRY_BACKOFF_MS = 1000;
const CONTEXT_RELEASE_PAUSE_MS = 500;
function isNonRetryableError(msg: string): boolean {
  return msg.includes('No model loaded') || msg.includes('aborted') || msg.includes('Remote provider')
    // Vulkan has no tool calling; retrying cannot change that.
    || msg.includes('Tools are not available on the Vulkan')
    // A native decode/evaluation failure (llama_decode: failed to decode, ret=-1 →
    // "Failed to evaluate chunks", or an invalid-token abort) is FATAL and DETERMINISTIC: the
    // context/inputs that failed the decode will fail identically on every retry. Retrying it only
    // burns ~26s per attempt × 4 attempts of silent spinner (B13: "the vision thing failed and I
    // didn't get an error") before finally surfacing. Break immediately so the error reaches the
    // user and the loading state clears at once.
    || /failed to decode|evaluate chunks|invalid token/i.test(msg);
}
/** A server rejected the request because it couldn't compile the tool schemas into a
 *  grammar (llama.cpp: "failed to parse grammar" / "failed to initialize samplers").
 *  We can't know a server's grammar-compiler limits up front, so we detect it from the
 *  error and retry without tools rather than hard-failing the turn. Exported for tests. */
function isToolGrammarError(msg: string): boolean {
  return /parse grammar|initialize samplers/i.test(msg);
}

/** One remote generation attempt with the given tool set. */
/** A stream that emitted at least one token before failing — carried on the rejection so
 *  callers know a retry would DUPLICATE already-streamed output into the same consumer. */
type StreamedError = Error & { streamed?: boolean };


/** Local models sometimes emit malformed tool-call JSON. A throw inside the completion callback would leave the generation promise unsettled, so bad arguments become an empty object and the tool reports the missing fields itself. */
function parseToolArguments(raw: unknown): Record<string, any> {
  if (typeof raw !== 'string') return (raw as Record<string, any>) ?? {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    logger.warn(`[ToolLoop] malformed tool arguments ignored: ${raw.slice(0, 120)}`);
    return {};
  }
}

function remoteGenerateOnce(
  provider: any,
  args: { messages: Message[]; tools: any[]; thinkingEnabled: boolean; onStream?: (data: StreamToken) => void },
): Promise<{ fullResponse: string; toolCalls: ToolCall[] }> {
  const { messages, tools, thinkingEnabled, onStream } = args;
  const settings = useAppStore.getState().settings;
  const ov = activeAgentOverrides();
  const options: GenerationOptions = { temperature: ov.temperature ?? settings.temperature, maxTokens: ov.maxTokens ?? settings.maxTokens, topP: ov.topP ?? settings.topP, tools, enableThinking: thinkingEnabled };
  let _fullContent = '';
  let streamed = false;
  let toolCalls: ToolCall[] = [];
  return new Promise((resolve, reject) => {
    provider.generate(messages, options, {
      onToken: (token: string) => { _fullContent += token; streamed = true; onStream?.({ content: token }); },
      onReasoning: (content: string) => { streamed = true; onStream?.({ reasoningContent: content }); },
      onComplete: (result: CompletionResult) => {
        if (result.toolCalls && result.toolCalls.length > 0) {
          toolCalls = result.toolCalls.map((tc, index) => ({
            id: tc.id || `call-${Date.now()}-${index}`,
            name: tc.name,
            arguments: parseToolArguments(tc.arguments),
          }));
        }
        resolve({ fullResponse: result.content, toolCalls });
      },
      onError: (error: Error) => {
        logger.error(`[ToolLoop] onError — ${error.message}`);
        (error as StreamedError).streamed = streamed;
        reject(error);
      },
    });
  });
}

/** Call remote LLM provider with tools */
async function callRemoteLLMWithTools(
  messages: Message[], tools: any[],
  opts?: { onStream?: (data: StreamToken) => void; disableThinking?: boolean },
): Promise<{ fullResponse: string; toolCalls: ToolCall[] }> {
  const activeServerId = useRemoteServerStore.getState().activeServerId;
  if (!activeServerId) throw new Error('No remote provider active');
  const provider = providerRegistry.getProvider(activeServerId);
  if (!provider) throw new Error('Remote provider not found');
  const settings = useAppStore.getState().settings;
  const thinkingEnabled = !opts?.disableThinking && settings.thinkingEnabled && provider.capabilities.supportsThinking;
  try {
    return await remoteGenerateOnce(provider, { messages, tools, thinkingEnabled, onStream: opts?.onStream });
  } catch (e: any) {
    const msg = e?.message || String(e) || '';
    // The server couldn't compile our tool schemas into a grammar. Rather than strand the
    // turn on a "Generation Error", retry once WITHOUT tools so the user still gets an
    // answer. (The real fix is sending grammar-safe schemas — see pruneToolNoise — this
    // is the safety net for a schema/server combo we didn't anticipate.)
    // Only retry if the failed attempt streamed NOTHING — otherwise the retry would
    // stream a second answer into the same consumer, duplicating/corrupting the output.
    // A grammar 400 fails at request time (before any token), so the common case is clean.
    if (tools.length > 0 && isToolGrammarError(msg) && !(e as StreamedError).streamed) {
      logger.warn(`[ToolLoop] remote rejected tool grammar; retrying without tools: ${msg.slice(0, 140)}`);
      return remoteGenerateOnce(provider, { messages, tools: [], thinkingEnabled, onStream: opts?.onStream });
    }
    throw e;
  }
}

async function callLocalWithRetry(
  messages: Message[],
  tools: any[],
  onStream?: (data: StreamToken) => void,
): Promise<{ fullResponse: string; toolCalls: ToolCall[]; interrupted?: boolean }> {
  let lastError: any;
  for (let attempt = 0; attempt < MAX_LLM_RETRIES; attempt++) {
    try {
      return await llmService.generateResponseWithTools(messages, { tools, onStream });
    } catch (e: any) {
      lastError = e;
      const msg = e?.message || String(e) || '';
      if (isNonRetryableError(msg) || attempt >= MAX_LLM_RETRIES - 1) break;
      await llmService.stopGeneration().catch(() => { });
      await new Promise<void>(resolve => setTimeout(resolve, (attempt + 1) * RETRY_BACKOFF_MS));
    }
  }
  throw new Error(lastError?.message || String(lastError) || 'Unknown LLM error after tool execution');
}

/** Is the active text engine LiteRT? Delegates to the engines.ts owner (getActiveEngineService) so
 *  "which engine is active" is defined ONCE — never re-derived from the store here. Loaded-readiness is a
 *  separate concern the caller (checkProviderReadiness) already gates before the loop runs. */
function isLiteRTActive(): boolean {
  return getActiveEngineService() === liteRTService;
}

/** True when generation is served by a remote provider (no on-device native context). Delegates to the
 *  engines.ts owner (isRemoteTextModelActive) — the single source for the activeServer+hasProvider+!localLoaded
 *  rule — plus the explicit caller override. */
function isUsingRemote(forceRemote?: boolean): boolean {
  return forceRemote || isRemoteTextModelActive();
}

/** On first iteration: last user message. On tool-result iterations: formatted tool results. */
function buildLiteRTSendText(messages: Message[]): string {
  const toolResults: Message[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'tool') toolResults.unshift(messages[i]);
    else break;
  }
  if (toolResults.length > 0) {
    const parts = toolResults.map(m => `${m.toolName || 'tool'}: ${m.content}`);
    return `Tool results:\n${parts.join('\n\n')}\n\nPlease continue based on these results.`;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const c = messages[i].content;
      return typeof c === 'string' ? c : '';
    }
  }
  return '';
}

export function buildLiteRTHistory(messages: Message[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUserIdx = i; break; } }
  if (lastUserIdx <= 0) return [];
  return messages.slice(0, lastUserIdx)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: typeof m.content === 'string' ? m.content : '' }))
    .filter(h => h.content.trim() !== '');
}

/** Records the tool results a LiteRT native turn produced, so an empty final answer can
 *  still surface the fetched data instead of discarding it (Q5). */
interface LiteRTToolOutcome { results: string[] }

function buildLiteRTToolCallHandler(ctx: ToolLoopContext, conversationId: string, outcome?: LiteRTToolOutcome) {
  // Per-turn counter: this closure is rebuilt once per generation, so it resets each new
  // message and the native loop reuses it for every tool call within the turn.
  let toolCallCount = 0;
  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (ctx.isAborted()) return 'Aborted';
    toolCallCount++;
    if (toolCallCount > MAX_LITERT_TOOL_CALLS) {
      return `Tool call limit reached (${MAX_LITERT_TOOL_CALLS} per response). Do not call any more tools. Answer now using the information you already have.`;
    }
    ctx.callbacks?.onToolCallStart?.(name, args as Record<string, any>);
    const toolCall: ToolCall = { id: `native-tc-${Date.now()}`, name, arguments: args as Record<string, any> };
    if (ctx.projectId) (toolCall as any).context = { projectId: ctx.projectId };
    // Route EVERY outcome through the same contract as the JS loop: a throw becomes a
    // typed error result (it never crashes the native turn), and the string handed to
    // the model (toolResultModelContent) is never empty — a failure/empty is stated
    // explicitly rather than sent as "" or a bare "Error: ...", so the model can't
    // mistake it for a successful answer.
    const result = await executeToolCallSafely(toolCall, ctx.enabledToolIds);
    ctx.callbacks?.onToolCallComplete?.(name, result);
    const resultContent = toolResultModelContent(result);
    const toolCallMsg: Message = { id: `tc-${Date.now()}-${name}`, role: 'assistant', content: '',
      toolCalls: [{ id: toolCall.id, name, arguments: JSON.stringify(toolCall.arguments) }], timestamp: Date.now() };
    const toolResultMsg: Message = { id: `tr-${Date.now()}-${name}`, role: 'tool', content: resultContent,
      toolCallId: toolCall.id, toolName: name, timestamp: Date.now() };
    useChatStore.getState().addMessage(conversationId, toolCallMsg);
    useChatStore.getState().addMessage(conversationId, toolResultMsg);
    if (result.status === 'ok') outcome?.results.push(resultContent);
    return resultContent;
  };
}

async function callLiteRTForLoop(
  conversationId: string,
  messages: Message[],
  opts: { tools: any[]; onStream?: (data: StreamToken) => void; ctx?: ToolLoopContext },
): Promise<{ fullResponse: string; toolCalls: ToolCall[] }> {
  const { tools, onStream, ctx } = opts;
  const systemMsg = messages.find(m => m.role === 'system');
  const systemPrompt = typeof systemMsg?.content === 'string' ? systemMsg.content : '';
  const text = buildLiteRTSendText(messages);
  const history = buildLiteRTHistory(messages);
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  // Route media through the SAME seam the non-tool path uses (generationServiceHelpers),
  // not an inline re-derivation. modelInputAudioUris is transcript-only ([]), so a voice
  // note's stale audio path never reaches native (Q17: the tool-loop's own filter sent
  // the .wav → "File does not exist" crash). One media rule, both paths.
  const imageUris = modelInputImageUris(lastUser?.attachments);
  const audioUris = modelInputAudioUris(lastUser?.attachments);
  const liteRTSettings = useAppStore.getState().settings;
  const samplerConfig = {
    temperature: liteRTSettings.liteRTTemperature,
    topK: 40,
    topP: liteRTSettings.liteRTTopP,
  };
  // An audio- or image-only turn carries no text — generate from the media alone.
  if (!text && !imageUris?.length && !audioUris?.length) {
    return { fullResponse: '', toolCalls: [] };
  }
  await liteRTService.prepareConversation(conversationId, systemPrompt, { samplerConfig, tools, history });
  const outcome: LiteRTToolOutcome = { results: [] };
  const onToolCall = ctx ? buildLiteRTToolCallHandler(ctx, conversationId, outcome) : undefined;
  const handlers = {
    onToken: (token: string) => onStream?.({ content: token }),
    onReasoning: (token: string) => onStream?.({ reasoningContent: token }),
  };
  try {
    const fullResponse = await liteRTService.generateRaw(text, { imageUris, audioUris }, { ...handlers, onToolCall });
    // Native SDK handles all tool→model cycles internally; toolCalls always empty here.
    // If the model ran a tool but then produced NO final answer, surface the fetched
    // data instead of discarding it (the user would otherwise see a blank / "(No
    // response)" turn — Q5). The tool result is the honest answer the model failed to
    // phrase; better a visible result than a dead end.
    if (!fullResponse.trim() && outcome.results.length > 0) {
      return { fullResponse: outcome.results.join('\n\n'), toolCalls: [] };
    }
    return { fullResponse, toolCalls: [] };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // The litertlm native FC parser hard-fails (Status Code 3) when a small model emits
    // a malformed tool call. Rather than surface a raw "Generation Error", retry once
    // WITHOUT tools so the user still gets a text answer instead of a crashed turn.
    if (!/parse (tool|FC) calls|Status Code: 3/i.test(msg)) throw e;
    logger.warn(`[ToolLoop] LiteRT tool-call parse failed; retrying without tools: ${msg.slice(0, 140)}`);
    await liteRTService.prepareConversation(conversationId, systemPrompt, { samplerConfig, tools: [], history });
    const fullResponse = await liteRTService.generateRaw(text, { imageUris, audioUris }, handlers);
    return { fullResponse, toolCalls: [] };
  }
}

const TOOL_BEHAVIOR_GUIDANCE = '\n\nMake good use of the tools available to you. If you are uncertain or lack current information, use the appropriate tool rather than guessing. Never refuse or say you cannot help when a tool is available. For multiple distinct items, make a separate tool call for each. Call tools silently - do not announce them first. To find or look up content, prefer a general search tool (e.g. a tool whose name contains "search" or "fetch") before specialized query tools. If a tool returns an error, try a different tool that could accomplish the task before giving up.';

/** Tools that need precise time-of-day to resolve relative phrases like "in half an hour". */
const TIME_SENSITIVE_TOOL_IDS = ['create_calendar_event', 'read_calendar_events'];

function augmentSystemPromptForTools(
  messages: Message[],
  enabledToolIds: string[] = [],
  nativeToolCalling = false,
): Message[] {
  const sysIdx = messages.findIndex(m => m.role === 'system');
  if (sysIdx === -1) {
    logger.log(`[ToolLoop] augmentSystemPrompt: NO system message - date NOT injected (enabledToolIds=[${enabledToolIds.join(',')}])`);
    return messages;
  }
  const sys = messages[sysIdx];
  const existing = typeof sys.content === 'string' ? sys.content : '';
  // Extension text hints (e.g. MCP's "call tools using <mcp_tool_call>{…}") only make
  // sense when the model has NO native tool calling. With native tool calling the model
  // is already given the tools structurally; adding the text hint makes it emit a hybrid
  // format that neither llama.cpp nor our parsers recognise — breaking BOTH MCP and
  // built-in tool calls. So skip the hint whenever native tool calling is available.
  const extHints = nativeToolCalling
    ? ''
    : getToolExtensions().map(e => e.getSystemPromptHint()).filter(Boolean).join('');
  // Snapshot the current time ONCE so the system-prompt date and the exact-time note
  // can never disagree across a midnight/second rollover (both read the same snapshot).
  const parts = nowParts();
  // System prompt gets only the STABLE date (changes once a day) + tool guidance, so the
  // system+tools prefix stays cacheable turn-to-turn.
  const updatedSys = { ...sys, content: existing + TOOL_BEHAVIOR_GUIDANCE + buildDateContext(parts) + extHints };
  const out = [...messages.slice(0, sysIdx), updatedSys, ...messages.slice(sysIdx + 1)];

  // For time-sensitive (calendar) tools, append the EXACT time to the latest user
  // message instead of the system prefix — keeps the big prefix cacheable while still
  // giving the model sub-day precision.
  const precise = enabledToolIds.some(id => TIME_SENSITIVE_TOOL_IDS.includes(id));
  let exactTimeAppended = false;
  if (precise) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].role === 'user' && typeof out[i].content === 'string') {
        out[i] = { ...out[i], content: (out[i].content as string) + buildExactTimeNote(parts) };
        exactTimeAppended = true;
        break;
      }
    }
  }
  logger.log(
    `[ToolLoop] augmentSystemPrompt: enabledToolIds=[${enabledToolIds.join(',')}] ` +
      `timeSensitive(precise)=${precise} nativeToolCalling=${nativeToolCalling} ` +
      `dateInSystem=true exactTimeOnLatestUser=${exactTimeAppended}`,
  );
  return out;
}

interface CallLLMOptions { onStream?: (data: StreamToken) => void; forceRemote?: boolean; disableThinking?: boolean; conversationId?: string; ctx?: ToolLoopContext; }

/** Call LLM with retry+backoff for transient native context errors. */
async function callLLMWithRetry(
  messages: Message[],
  tools: any[],
  { onStream, forceRemote, disableThinking, conversationId, ctx }: CallLLMOptions = {},
): Promise<{ fullResponse: string; toolCalls: ToolCall[]; interrupted?: boolean }> {
  // Append tool-use behavioral guidance to the system prompt when tools are present.
  // Only covers the "when and how" — schemas are injected separately by each engine.
  // Also append extension system-prompt hints so the model knows about extension tools.
  // We shallow-copy messages to avoid mutating the caller's array.
  const exts = getToolExtensions();
  const extCount = exts.reduce((n, e) => n + e.enabledToolCount(), 0);
  const useRemote = isUsingRemote(forceRemote);
  // LiteRT (OpenApiTool), remote providers, and llama with a Jinja tool template all do
  // native tool calling — the text hint must be suppressed for them (see augmentSystemPromptForTools).
  const nativeToolCalling = (isLiteRTActive() && !!conversationId) || useRemote || llmService.supportsToolCalling();
  logger.log(
    `[ToolLoop] preLLM: tools=${tools.length} extCount=${extCount} ` +
      `enabledToolIds=[${(ctx?.enabledToolIds ?? []).join(',')}] ` +
      `willAugment=${tools.length > 0 || extCount > 0} liteRT=${isLiteRTActive()} useRemote=${useRemote} nativeToolCalling=${nativeToolCalling}`,
  );
  const augmentedMessages = (tools.length > 0 || extCount > 0)
    ? augmentSystemPromptForTools(messages, ctx?.enabledToolIds, nativeToolCalling)
    : messages;

  if (isLiteRTActive() && conversationId) {
    return callLiteRTForLoop(conversationId, augmentedMessages, { tools, onStream, ctx });
  }
  if (useRemote) {
    try { return await callRemoteLLMWithTools(augmentedMessages, tools, { onStream, disableThinking }); }
    catch (e: any) { throw new Error(e?.message || String(e) || 'Remote LLM error'); }
  }
  return callLocalWithRetry(augmentedMessages, tools, onStream);
}

/** Detect if text contains any tool call pattern (various model formats). */
function containsToolCallMarkup(text: string): boolean {
  return text.includes('<tool_call>') ||
    text.includes('<invoke') ||
    /\w+:tool_call/.test(text) ||
    text.includes('<function_call>');
}

/** If no structured tool calls, try parsing tool-call markup (<tool_call>, <invoke>, namespaced
 *  wrappers, <function_call>) or Gemma's native format from text. Also collects tool calls from
 *  any registered extensions and strips their syntax from display text. */
function resolveToolCalls(fullResponse: string, toolCalls: ToolCall[]) {
  let effectiveToolCalls: ToolCall[] = toolCalls.length > 0 ? [...toolCalls] : [];
  let displayResponse = fullResponse;

  if (effectiveToolCalls.length === 0) {
    if (fullResponse.includes('<|tool_call>') || fullResponse.includes('<tool_call:')) {
      const parsed = parseGemmaNativeToolCalls(fullResponse);
      if (parsed.toolCalls.length > 0) {
        // FALLBACK FIRED: native tool_calls were empty but raw Gemma markup was present, so we
        // hand-parsed. With reasoning_format:'auto' this should stop happening once llama.cpp parses
        // Gemma natively — if this never logs on-device, the hand-parser is safe to delete (Step 5).
        logger.log(`[ToolLoop][GEMMA-FALLBACK] hand-parsed ${parsed.toolCalls.length} tool call(s) from raw markup — native tool_calls were empty`);
        effectiveToolCalls = parsed.toolCalls;
        displayResponse = parsed.cleanText;
      }
    } else if (containsToolCallMarkup(fullResponse)) {
      const parsed = parseToolCallsFromText(fullResponse);
      if (parsed.toolCalls.length > 0) {
        effectiveToolCalls = parsed.toolCalls;
        displayResponse = parsed.cleanText;
      }
    }
  }

  // Parse extension tool calls and strip their syntax from the visible text
  for (const ext of getToolExtensions()) {
    const extCalls = ext.parseToolCalls(displayResponse);
    if (extCalls.length > 0) {
      effectiveToolCalls.push(...extCalls);
    }
    displayResponse = ext.stripFromVisibleText(displayResponse);
  }

  return { effectiveToolCalls, displayResponse };
}

interface ToolLoopState {
  firstTokenFired: boolean; thinkingDoneFired: boolean;
  streamedContent: string; reasoningContent: string;
}

function buildStreamHandler(ctx: ToolLoopContext, state: ToolLoopState): ((data: StreamChunk) => void) | undefined {
  if (!ctx.onStream) return undefined;
  return (data: StreamChunk) => {
    if (ctx.isAborted()) return;
    const chunk = normalizeStreamChunk(data);
    // Only fire onThinkingDone when the first *content* token arrives — reasoning
    // tokens mean the model is still thinking, so keep isThinking=true until then.
    if (chunk.content && !state.firstTokenFired) {
      state.firstTokenFired = true;
      state.thinkingDoneFired = true;
      ctx.onThinkingDone();
      ctx.callbacks?.onFirstToken?.();
    }
    if (chunk.content) state.streamedContent += chunk.content;
    if (chunk.reasoningContent) state.reasoningContent += chunk.reasoningContent;
    ctx.onStream!(data);
  };
}

function emitFinalResponse(ctx: ToolLoopContext, state: ToolLoopState, reply: { text: string; messages: Message[] }): void {
  const displayResponse = reply.text;
  // The model may claim it saved a file it never wrote; say so in the reply itself.
  const note = fileClaimNote(displayResponse, reply.messages);
  if (!state.streamedContent) {
    if (!state.thinkingDoneFired) {
      ctx.onThinkingDone();
      ctx.callbacks?.onFirstToken?.();
    }
    ctx.onFinalResponse((displayResponse || '_(No response)_') + note);
  } else if (note) {
    useChatStore.getState().appendToStreamingMessage(note);
  }
}

/** Force a final text-only generation (no tools) when iteration/call caps are hit. */
async function forceFinalTextResponse(ctx: ToolLoopContext, state: ToolLoopState, loopMessages: Message[]): Promise<void> {
  state.streamedContent = '';
  state.reasoningContent = '';
  state.firstTokenFired = false;
  const forcedOnStream = buildStreamHandler(ctx, state);
  const { fullResponse: forcedResponse } = await callLLMWithRetry(loopMessages, [], { onStream: forcedOnStream, forceRemote: ctx.forceRemote, disableThinking: true, conversationId: ctx.conversationId, ctx });
  emitFinalResponse(ctx, state, { text: forcedResponse, messages: loopMessages });
}

/**
 * On-device two-pass tool routing. Built-in tools (few, tiny) are ALWAYS kept; the
 * routing pass only decides which of the many MCP/ext tools to include, so a small
 * model isn't handed every schema. The small model rarely emits the literal "none",
 * so the rule is simply: router names MCP tools → include those; names nothing
 * usable → keep built-in only (do NOT dump all MCP tools). A thrown error (genuine
 * failure) still falls back to everything so a real request is never stranded.
 *
 * LiteRT (Android) routes via its native session; llama routes ONLY on iOS (Metal
 * makes the extra prefill cheap — on Android llama it caused high TTFT). Remote
 * models keep the full set. Routing never enters chat/context.
 */
async function selectEffectiveSchemas(ctx: ToolLoopContext, builtInSchemas: any[], extSchemas: any[]): Promise<any[]> {
  const all = [...builtInSchemas, ...extSchemas];
  const litertActive = isLiteRTActive();
  const llamaIosNative = !litertActive && Platform.OS === 'ios' && llmService.supportsToolCalling();
  const usingRemote = isUsingRemote();

  // MCP enabled on-device: route the many MCP/ext tools down with the embedding model
  // BEFORE generating, so the big model only prefills the relevant handful instead of
  // every schema (the time-to-first-token killer). Works on Android llama too, since
  // it runs on the tiny MiniLM context, not the main model. Built-in tools always stay.
  if (!usingRemote && isMcpEnabled() && extSchemas.length > 0 && all.length > TOOL_SELECTION_THRESHOLD) {
    try {
      const selected = await selectToolsByEmbedding(getLastUserQuery(ctx.messages), extSchemas, MCP_TOOL_ROUTE_TOPK);
      const filteredExt = extSchemas.filter(s => selected.includes(s.function.name));
      return [...builtInSchemas, ...filteredExt];
    } catch (e) {
      logger.warn(`[ToolLoop] embedding tool routing failed; using all tools: ${String(e)}`);
      return all;
    }
  }

  const shouldRoute = !usingRemote && (litertActive || llamaIosNative) && extSchemas.length > 0 && all.length > TOOL_SELECTION_THRESHOLD;
  if (!shouldRoute) return all;

  // LiteRT routes on a throwaway native session (default); llama via a capped completion.
  const generate = litertActive ? undefined : (s: string, u: string) => llmService.generateToolSelection(s, u);
  try {
    // Route over the MCP/ext tools only — built-in tools are always kept.
    const selected = await selectRelevantTools(getLastUserQuery(ctx.messages), extSchemas, generate);
    if (!selected || selected.length === 0) {
      // No MCP tool named (router said "none" OR just didn't name one) → built-in only.
      return builtInSchemas;
    }
    const filteredExt = extSchemas.filter(s => selected.includes(s.function.name));
    return [...builtInSchemas, ...filteredExt];
  } catch (e) {
    logger.warn(`[ToolLoop] tool selection failed; using all tools: ${String(e)}`);
    return all;
  }
}

/**
 * Run the tool-calling loop: call LLM → execute tools → re-inject results → repeat.
 * Returns when the model produces a final response with no tool calls.
 */
/** Outcome of a tool-loop turn. `interrupted` is PER-TURN truth (a user stop landed on this
 *  turn's completion) — callers must use it instead of the service's shared abort flag, which a
 *  CONCURRENT next turn resets (the race that painted 'No response' on a user-stopped turn). */
export interface ToolLoopOutcome { interrupted: boolean }

export async function runToolLoop(ctx: ToolLoopContext): Promise<ToolLoopOutcome> {
  const chatStore = useChatStore.getState();
  const builtInSchemas = getToolsAsOpenAISchema(ctx.enabledToolIds);
  const extSchemas = getToolExtensions().flatMap(e => e.getOpenAISchemas?.() ?? []);

  const effectiveSchemas = await selectEffectiveSchemas(ctx, builtInSchemas, extSchemas);
  ctx.onToolsRouted?.(effectiveSchemas.map((s: any) => s?.function?.name).filter(Boolean));

  const loopMessages = [...ctx.messages];
  let totalToolCalls = 0;
  const state: ToolLoopState = { firstTokenFired: false, thinkingDoneFired: false, streamedContent: '', reasoningContent: '' };
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (ctx.isAborted()) {
      break;
    }

    // Hit iteration or total-call cap — force one final text-only generation (no tools)
    if (iteration === MAX_TOOL_ITERATIONS - 1 || totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
      await forceFinalTextResponse(ctx, state, loopMessages);
      return { interrupted: false };
    }

    state.streamedContent = '';
    state.reasoningContent = '';

    const onStream = buildStreamHandler(ctx, state);
    const { fullResponse, toolCalls, interrupted } = await callLLMWithRetry(loopMessages, effectiveSchemas, { onStream, forceRemote: ctx.forceRemote, conversationId: ctx.conversationId, ctx });

    // A user STOP landing mid-completion returns `interrupted` — the turn is OVER. Before this
    // guard, the interrupted (usually empty) result fell into the no-tools fallback below and
    // re-ran a FULL generation the user never asked for: a zombie that held the engine for
    // minutes (74s CPU prefill on-device) so every next send failed 'LLM service busy', and
    // whose empty output painted the wrong "No response / incompatible backend" card. Finalize
    // whatever streamed; issue NO further completions. When aborted, stopGeneration() owns the
    // partial-content cleanup — emit nothing here.
    if (interrupted || ctx.isAborted()) {
      // Streamed partial content is already in the store's streaming message: the aborted path is
      // finalized by stopGeneration(), the non-aborted path by generate()'s post-loop finalize.
      logger.log(`[ToolLoop] completion interrupted (aborted=${ctx.isAborted()}) — ending turn, no follow-up generation`);
      return { interrupted: true };
    }

    const { effectiveToolCalls, displayResponse } = resolveToolCalls(fullResponse, toolCalls);
    const cappedToolCalls = effectiveToolCalls.slice(0, MAX_TOTAL_TOOL_CALLS - totalToolCalls);
    totalToolCalls += cappedToolCalls.length;

    // No tool calls → model gave a final text response
    if (cappedToolCalls.length === 0) {
      // Empty response with tools — retry once without tools (some models choke on tool schemas).
      // Never after an abort: this retry is a FULL generation, the exact zombie a stop must kill.
      if (!state.streamedContent && !displayResponse && !ctx.isAborted()) {
        state.streamedContent = '';
        state.reasoningContent = '';
        state.firstTokenFired = false;
        const fallbackOnStream = buildStreamHandler(ctx, state);
        const { fullResponse: fallbackResp } = await callLLMWithRetry(
          loopMessages, [], { onStream: fallbackOnStream, forceRemote: ctx.forceRemote, disableThinking: true, conversationId: ctx.conversationId, ctx },
        );
        emitFinalResponse(ctx, state, { text: fallbackResp, messages: loopMessages });
        return { interrupted: false };
      }
      emitFinalResponse(ctx, state, { text: displayResponse, messages: loopMessages });
      return { interrupted: false };
    }

    // Execute the tool calls
    if (state.streamedContent) { ctx.onStreamReset?.(); chatStore.setStreamingMessage(''); }

    const assistantMsg: Message = {
      id: `tool-assist-${Date.now()}-${iteration}`, role: 'assistant',
      content: displayResponse || state.streamedContent || '', timestamp: Date.now(),
      // Persist this round's reasoning on the tool-call message so the chain-of-thought
      // that LED to the tool call survives in the transcript (OD14) — without it the
      // thinking visibly vanishes when the tool fires and only reappears on the final
      // answer, losing the pre-tool-call reasoning (a killer-demo feature). Each round's
      // thinking stays attached to its own message, so both rounds are kept.
      ...(state.reasoningContent.trim() ? { reasoningContent: state.reasoningContent.trim() } : {}),
      toolCalls: cappedToolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: JSON.stringify(tc.arguments) })),
    };
    loopMessages.push(assistantMsg);
    chatStore.addMessage(ctx.conversationId, assistantMsg);

    await executeToolCalls(ctx, cappedToolCalls, loopMessages);

    chatStore.setIsThinking(true);
    // The pause exists to let an on-device llama context settle between the tool
    // result and the next prefill. Remote providers have no native context to
    // release, so skip the dead time there — it only inflated MCP latency per turn.
    if (!isUsingRemote(ctx.forceRemote)) {
      await new Promise<void>(resolve => setTimeout(resolve, CONTEXT_RELEASE_PAUSE_MS));
    }
  }
  // Reached only via the top-of-iteration abort break or iteration exhaustion.
  return { interrupted: ctx.isAborted() };
}
