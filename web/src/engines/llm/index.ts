// Engine selection. Order of preference: the desktop llama-server (full speed, vision, tools),
// then WebGPU models (model id from the WebGPU catalog), then WASM llama.cpp for any GGUF.
import type { LlmBackend, LlmSession, LoadParams } from './types';
import { serverBackend } from './serverBackend';
import { wllamaBackend } from './wllamaBackend';
import { webgpuBackend } from './webgpuBackend';

export * from './types';

const backends: LlmBackend[] = [serverBackend, webgpuBackend, wllamaBackend];
export function registerBackend(b: LlmBackend, first = false) {
  if (first) backends.unshift(b);
  else backends.splice(backends.length - 1, 0, b);
}

export async function loadSession(params: LoadParams, onProgress?: (percent: number) => void): Promise<LlmSession> {
  for (const b of backends) {
    if (await b.supports(params)) return b.load(params, onProgress);
  }
  throw new Error('No engine in this build can load this model file.');
}
