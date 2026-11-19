/**
 * HTTP Client for Remote LLM Servers
 *
 * Handles HTTP requests and Server-Sent Events (SSE) parsing for
 * communicating with OpenAI-compatible and Anthropic-compatible servers.
 */

import logger from '../utils/logger';
import { createSSELineProcessor } from './httpClientSSE';

export { parseOpenAIMessage, parseAnthropicMessage, parseSSEStream } from './httpClientSSE';
export { imageToBase64DataUrl, isPrivateNetworkEndpoint, testEndpoint, detectServerType } from './httpClientUtils';
// The stream-message types live in httpClientTypes so httpClientSSE can import them without
// importing this file (which imports SSE) — that would be a cycle. Imported for internal use here
// and re-exported for back-compat.
import type { SSEEvent } from './httpClientTypes';
export type { SSEEvent };

/** Options for fetch with timeout */
export interface FetchOptions extends RequestInit {
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Retry count for failed requests */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

/** Optional config for streaming requests */
interface StreamRequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

/** Request config for streaming requests (body + options) */
export interface StreamRequestConfig extends StreamRequestOptions {
  body: unknown;
}


/** Default timeouts */
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

const SAFE_TO_REPEAT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/** Reads the response body (JSON when the server says so, else text). */
async function readBody<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  return (contentType.includes('application/json') ? await response.json() : await response.text()) as T;
}

/**
 * Fetch with timeout and retry support.
 * The time limit covers the whole exchange, body included (a server that sends headers and then stalls cannot hang the caller), the
 * caller's own `signal` still cancels the request, and a request that could do something twice (POST, PATCH) is never repeated.
 */
export async function fetchWithTimeout<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    signal: callerSignal,
    ...fetchOptions
  } = options;
  const repeatable = SAFE_TO_REPEAT.has(String(fetchOptions.method ?? 'GET').toUpperCase());
  const attempts = repeatable ? retries : 0;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    const onCallerAbort = () => controller.abort();
    if (callerSignal?.aborted) controller.abort(); else callerSignal?.addEventListener?.('abort', onCallerAbort);

    try {
      if (controller.signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' }); // already cancelled: do not start
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      return await readBody<T>(response);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Cancelled by the caller or timed out: never retried (a timeout is reported as one, not as a cancel).
      if ((error as Error).name === 'AbortError' || controller.signal.aborted) {
        throw new Error(timedOut ? 'Request timed out' : 'Request cancelled');
      }

      // Retry on network errors
      if (attempt < attempts) {
        logger.log(`[HTTP] Retry ${attempt + 1}/${attempts} after error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener?.('abort', onCallerAbort);
    }
  }

  throw lastError || new Error('Request failed');
}

/**
 * Create a streaming request with SSE handling
 * Uses XMLHttpRequest for React Native compatibility with real-time streaming
 */
export async function createStreamingRequest(
  url: string,
  req: StreamRequestConfig,
  onEvent: (event: SSEEvent) => void
): Promise<void> {
  const { body, headers = {}, timeout = 300000, signal } = req;
  logger.log('[HttpClient] Creating streaming request to:', url);
  return new Promise((resolve, reject) => {
    // XMLHttpRequest is required for SSE streaming in React Native as fetch
    // does not support real-time streaming with progress events.
    // Requests are validated by isPrivateNetworkEndpoint before use.
    const xhr = new XMLHttpRequest(); // NOSONAR

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        resolve();
      });
    }

    const timeoutId = setTimeout(() => {
      xhr.abort();
      reject(new Error('Request timeout'));
    }, timeout);

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    // Track processed length for incremental parsing
    let processedLength = 0;
    const sseProcessor = createSSELineProcessor(onEvent);

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        clearTimeout(timeoutId);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            // Process any remaining data
            const responseText = xhr.responseText;
            if (responseText.length > processedLength) {
              const newData = responseText.slice(processedLength);
              processedLength = responseText.length;
              sseProcessor.process(newData);
            }
            sseProcessor.flush();
            resolve();
          } catch (err) {
            reject(err);
          }
        } else {
          // Log the full server error body — a bare "HTTP 400" is undiagnosable; the body
          // (e.g. llama.cpp's "failed to parse grammar") is what tells you what to fix.
          logger.error(`[HttpClient] HTTP ${xhr.status} error body: ${xhr.responseText || '(empty)'}`);
          reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || 'Unknown error'}`));
        }
      }
    };

    // Handle progress events for real-time streaming
    xhr.onprogress = () => {
      const responseText = xhr.responseText;
      if (responseText.length > processedLength) {
        const newData = responseText.slice(processedLength);
        processedLength = responseText.length;
        sseProcessor.process(newData);
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Network error'));
    };

    xhr.ontimeout = () => {
      clearTimeout(timeoutId);
      reject(new Error('Request timeout'));
    };

    try {
      const bodyStr = JSON.stringify(body);
      logger.log('[HttpClient] Sending request body, length:', bodyStr.length);
      xhr.send(bodyStr);
    } catch (err) {
      clearTimeout(timeoutId);
      logger.error('[HttpClient] Error sending request:', err);
      reject(err);
    }
  });
}

/**
 * Stream NDJSON responses (Ollama /api/chat format).
 * Each line is a complete JSON object — no SSE "data:" prefix.
 */
export async function createNDJSONStreamingRequest(
  url: string,
  req: StreamRequestConfig,
  onLine: (parsed: Record<string, unknown>) => void
): Promise<void> {
  const { body, headers = {}, timeout = 300000, signal } = req;
  logger.log('[HttpClient] Creating NDJSON streaming request to:', url);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); // NOSONAR

    if (signal) {
      signal.addEventListener('abort', () => { xhr.abort(); resolve(); });
    }

    const timeoutId = setTimeout(() => { xhr.abort(); reject(new Error('Request timeout')); }, timeout);

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

    let processedLength = 0;
    let lineBuffer = '';

    const processChunk = (text: string) => {
      // Prepend any leftover partial line from the previous chunk
      const combined = lineBuffer + text;
      const lines = combined.split('\n');
      // Last element may be an incomplete line — hold it for the next chunk
      lineBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onLine(JSON.parse(trimmed) as Record<string, unknown>);
        } catch {
          logger.warn('[HttpClient] Failed to parse NDJSON line:', trimmed.substring(0, 100));
        }
      }
    };

    xhr.onprogress = () => {
      const text = xhr.responseText;
      if (text.length > processedLength) {
        processChunk(text.slice(processedLength));
        processedLength = text.length;
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        clearTimeout(timeoutId);
        if (xhr.status >= 200 && xhr.status < 300) {
          const text = xhr.responseText;
          if (text.length > processedLength) {
            processChunk(text.slice(processedLength));
          }
          // Flush any remaining buffered line
          if (lineBuffer.trim()) {
            try {
              onLine(JSON.parse(lineBuffer.trim()) as Record<string, unknown>);
            } catch {
              logger.warn('[HttpClient] Failed to parse final NDJSON line:', lineBuffer.substring(0, 100));
            }
            lineBuffer = '';
          }
          resolve();
        } else {
          // Log the full server error body — a bare "HTTP 400" is undiagnosable; the body
          // (e.g. llama.cpp's "failed to parse grammar") is what tells you what to fix.
          logger.error(`[HttpClient] HTTP ${xhr.status} error body: ${xhr.responseText || '(empty)'}`);
          reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || 'Unknown error'}`));
        }
      }
    };

    xhr.onerror = () => { clearTimeout(timeoutId); reject(new Error('Network error')); };
    xhr.ontimeout = () => { clearTimeout(timeoutId); reject(new Error('Request timeout')); };

    try {
      const bodyStr = JSON.stringify(body);
      logger.log('[HttpClient] Sending request body, length:', bodyStr.length);
      xhr.send(bodyStr);
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}
