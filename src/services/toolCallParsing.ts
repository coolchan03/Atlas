/**
 * Reading tool calls out of a model's plain-text reply (small models write them as JSON, XML, <invoke> blocks or Gemma's native format
 * instead of using structured tool calls). Pure text in, tool calls out. Split from generationToolLoop.ts so it can be tested on its own;
 * generationToolLoop re-exports parseToolCallsFromText for existing callers.
 */
import type { ToolCall } from './tools/types';
import { XML_TOOL_CALL_FUNCTION_MARKER, XML_TOOL_CALL_PARAMETER_MARKER } from '../utils/messageContent';

function parseXmlStyleToolCall(body: string, idSuffix: number): ToolCall | null {
  // Marker sources are shared with stripControlTokens (messageContent) so the extractor and the
  // display stripper key on the SAME `<function=…>`/`<parameter=…>` grammar and cannot drift.
  const funcMatch = body.match(new RegExp(XML_TOOL_CALL_FUNCTION_MARKER));
  if (!funcMatch) return null;
  const name = funcMatch[1];
  const args: Record<string, any> = {};
  const paramPattern = new RegExp(String.raw`${XML_TOOL_CALL_PARAMETER_MARKER}([\s\S]*?)(?=<parameter=|<\/|$)`, 'g');
  let pm;
  while ((pm = paramPattern.exec(body)) !== null) { args[pm[1]] = pm[2].trim(); }
  return { id: `text-tc-${Date.now()}-${idSuffix}`, name, arguments: args };
}

function parseToolCallBody(body: string, idSuffix: number): ToolCall | null {
  const makeCall = (name: string, args: any): ToolCall =>
    ({ id: `text-tc-${Date.now()}-${idSuffix}`, name, arguments: normalizeToolArgs(args) });

  // Standard JSON: {"name": "tool", "arguments": {...}}
  try {
    const parsed = parseJsonLenient(body);
    if (parsed.name) return makeCall(parsed.name, parsed.arguments ?? parsed.parameters ?? {});
  } catch { /* fall through */ }

  // Function-call style: tool_name({"key": "value"})
  const funcMatch = (/^(\w+)\s*\((\{[\s\S]*\})\)$/).exec(body);
  if (funcMatch) {
    try { return makeCall(funcMatch[1], parseJsonLenient(funcMatch[2])); } catch { /* fall through */ }
  }

  // Bare style: tool_name{"key": "value"}
  const bareMatch = (/^(\w+)\s*(\{[\s\S]*\})$/).exec(body);
  if (bareMatch) {
    try { return makeCall(bareMatch[1], parseJsonLenient(bareMatch[2])); } catch { /* fall through */ }
  }

  // No-args style: just a tool name with no arguments
  const noArgsMatch = (/^(\w+)$/).exec(body);
  if (noArgsMatch) return makeCall(noArgsMatch[1], {});

  return parseXmlStyleToolCall(body, idSuffix);
}
function fixUnquotedKeys(json: string): string {
  return json.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*):/g, '$1"$2"$3:');
}

/**
 * Parse JSON, recovering from the unquoted object keys small models routinely
 * emit ({expression: "2+2"}). The single lenient-parse used by EVERY tool-call
 * body path so the standard and Gemma parsers can't drift (they did: the Gemma
 * path recovered via fixUnquotedKeys while the standard path used a raw
 * JSON.parse and silently dropped the call — Q2). Throws if both attempts fail,
 * so callers keep their existing try/catch fall-through.
 */
function parseJsonLenient(s: string): any {
  try { return JSON.parse(s); }
  catch { return JSON.parse(fixUnquotedKeys(s)); }
}

/**
 * Normalize a tool call's `arguments` to an object. Small models sometimes emit
 * arguments as a STRINGIFIED JSON object ("{...}") rather than an object (Q3);
 * forwarding that string verbatim gives the tool undefined params. Parse a
 * JSON-object string to an object; pass a real object through; anything else → {}.
 */
function normalizeToolArgs(args: any): Record<string, any> {
  if (typeof args === 'string') {
    const s = args.trim();
    if (s.startsWith('{')) {
      try { return parseJsonLenient(s); } catch { /* not JSON → no usable params */ }
    }
    return {};
  }
  return args && typeof args === 'object' ? args : {};
}

function parseGemmaColonArgs(name: string, colonArgs: string): Record<string, any> {
  if (colonArgs.startsWith(name)) {
    const jsonBody = colonArgs.slice(name.length).trim();
    if (jsonBody.startsWith('{')) {
      try { return parseJsonLenient(jsonBody) as Record<string, any>; }
      catch { /* fall through */ }
    }
  }
  const firstColon = colonArgs.indexOf(':');
  if (firstColon !== -1) {
    const key = colonArgs.slice(0, firstColon).trim();
    if (/^\w+$/.test(key)) {
      return { [key]: colonArgs.slice(firstColon + 1).trim() };
    }
  }
  return {};
}

function parseGemmaToolCallBody(raw: string, toolCalls: ToolCall[]): void {
  const nameMatch = (/^(?:call:)?(\w+)/).exec(raw);
  if (!nameMatch) {
    return;
  }
  const name = nameMatch[1];
  const rest = raw.slice(nameMatch[0].length).trim();
  let args: Record<string, any> = {};

  const argsStr = (/^\((\{[\s\S]*\})\)$/).exec(rest)?.[1] ?? (/^(\{[\s\S]*\})$/).exec(rest)?.[1] ?? null;
  if (argsStr) {
    try {
      args = parseJsonLenient(argsStr);
    } catch { /* fall through */ }
  } else if (rest.startsWith(':')) {
    args = parseGemmaColonArgs(name, rest.slice(1));
  }
  args = normalizeToolArgs(args);

  if (name === 'web_search' && !args.query && args.queries) {
    args = { ...args, query: Array.isArray(args.queries) ? args.queries[0] : args.queries };
  }
  toolCalls.push({ id: `gemma-tc-${Date.now()}-${toolCalls.length}`, name, arguments: args });
}

/** Parse Gemma 4's native tool call format: <|tool_call>call:NAME{...}<tool_call|> and <tool_call:NAME{...}<tool_call|> */
export function parseGemmaNativeToolCalls(text: string): { cleanText: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  const pattern = /(?:<\|tool_call>|<tool_call:)([\s\S]*?)(?:<tool_call\|>|<\/tool_call>)/g;
  let match;
  const matchedRanges: [number, number][] = [];

  while ((match = pattern.exec(text)) !== null) {
    matchedRanges.push([match.index, match.index + match[0].length]);
    parseGemmaToolCallBody(match[1].trim().replaceAll('<|"|>', '"'), toolCalls);
  }

  // Fallback: unclosed <|tool_call> at end of text (model hit EOS without closing tag)
  if (toolCalls.length === 0) {
    const unclosedMatch = /(?:<\|tool_call>|<tool_call:)([\s\S]+)$/.exec(text);
    if (unclosedMatch) {
      parseGemmaToolCallBody(unclosedMatch[1].trim().replaceAll('<|"|>', '"'), toolCalls);
      if (toolCalls.length > 0) {
        matchedRanges.push([unclosedMatch.index, text.length]);
      }
    }
  }

  matchedRanges.sort((a, b) => b[0] - a[0]);
  let cleanText = text;
  for (const [start, end] of matchedRanges) { cleanText = cleanText.slice(0, start) + cleanText.slice(end); }
  return { cleanText: cleanText.trim(), toolCalls };
}

/** Parse <invoke name="fn"><parameter name="k">v</parameter></invoke> blocks (minimax, Anthropic-style). */
function parseInvokeBlocks(text: string, toolCalls: ToolCall[], matchedRanges: [number, number][]): void {
  const invokePattern = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;
  let match;
  while ((match = invokePattern.exec(text)) !== null) {
    const name = match[1];
    const args: Record<string, any> = {};
    const paramPattern = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
    let pm;
    while ((pm = paramPattern.exec(match[2])) !== null) { args[pm[1]] = pm[2].trim(); }
    toolCalls.push({ id: `text-tc-${Date.now()}-${toolCalls.length}`, name, arguments: args });
    matchedRanges.push([match.index, match.index + match[0].length]);
  }
}

/** Parse tool calls from text output (fallback for small models). Supports JSON, XML, and invoke formats. */
export function parseToolCallsFromText(text: string): { cleanText: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  const matchedRanges: [number, number][] = [];

  // 1. Standard <tool_call>...</tool_call> blocks (JSON or XML body)
  const closedPattern = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match;
  while ((match = closedPattern.exec(text)) !== null) {
    matchedRanges.push([match.index, match.index + match[0].length]);
    const call = parseToolCallBody(match[1].trim(), toolCalls.length);
    if (call) { toolCalls.push(call); }
  }
  // Unclosed <tool_call> at end of text (model hit EOS without closing tag)
  const unclosedMatch = /<tool_call>([\s\S]+)$/.exec(text);
  if (unclosedMatch) {
    const unclosedStart = text.lastIndexOf(unclosedMatch[0]);
    const alreadyMatched = matchedRanges.some(([s, e]) => unclosedStart >= s && unclosedStart < e);
    if (!alreadyMatched) {
      const call = parseToolCallBody(unclosedMatch[1].trim(), toolCalls.length);
      if (call) toolCalls.push(call);
      matchedRanges.push([unclosedStart, text.length]);
    }
  }

  // 2. <invoke name="...">...</invoke> blocks (minimax, Anthropic-style)
  parseInvokeBlocks(text, toolCalls, matchedRanges);

  // 3. Namespaced wrapper blocks: namespace:tool_call ... </namespace:tool_call>
  const nsPattern = /[\w]+:tool_call[\s\S]*?<\/[\w]+:tool_call>/g;
  while ((match = nsPattern.exec(text)) !== null) {
    const alreadyMatched = matchedRanges.some(([s, e]) => match!.index >= s && match!.index < e);
    if (!alreadyMatched) {
      // Parse invoke blocks within this namespace wrapper
      parseInvokeBlocks(match[0], toolCalls, []);
      matchedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  // Remove all matched ranges from text (reverse order to preserve indices)
  matchedRanges.sort((a, b) => b[0] - a[0]);
  let cleanText = text;
  for (const [start, end] of matchedRanges) { cleanText = cleanText.slice(0, start) + cleanText.slice(end); }
  return { cleanText: cleanText.trim(), toolCalls };
}
