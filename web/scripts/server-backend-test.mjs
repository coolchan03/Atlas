// Tests the Windows engine path (llama-server over HTTP) against a mock OpenAI-compatible server, in a real browser.
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const url = process.argv[2] || 'http://localhost:4173/';
const sse = (res, objs) => { for (const o of objs) res.write(`data: ${JSON.stringify(o)}\n\n`); res.write('data: [DONE]\n\n'); res.end(); };
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
    if (req.url === '/v1/chat/completions') {
      const j = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (j.tools) return sse(res, [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_time', arguments: '{"tz"' } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"UTC"}' } }] }, finish_reason: 'tool_calls' }] }]);
      return sse(res, [
        { choices: [{ delta: { reasoning_content: 'Let me think.' } }] }, { choices: [{ delta: { content: 'Hello' } }] }, { choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }] },
        { choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 }, timings: { prompt_n: 7, prompt_ms: 10, predicted_n: 3, predicted_ms: 30, predicted_per_second: 100 } }]);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/tokenize') return res.end(JSON.stringify({ tokens: [1, 2, 3] }));
    res.end('{}');
  });
});
await new Promise((r) => server.listen(8099, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
await page.addInitScript(() => {
  window.atlasHost = { llama: { capabilities: async () => ({ available: true, backends: ['vulkan', 'cpu'] }), start: async (o) => ({ id: 'ls1', port: 8099, backend: 'Vulkan', devices: ['Vulkan0: Test GPU'], nLayers: 24, gpuLayers: 24, metadata: {}, nCtx: o.n_ctx || 2048, vision: false }), stop: async () => {}, onProgress: () => () => {} } };
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__atlas, null, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { initLlama } = await window.__atlas.llama();
  const ctx = await initLlama({ model: '/atlas/files/models/x.gguf', n_ctx: 2048 });
  const seen = []; const res = await ctx.completion({ messages: [{ role: 'user', content: 'hi' }], n_predict: 16 }, (d) => seen.push([d.content, d.reasoning_content]));
  const tools = await ctx.completion({ messages: [{ role: 'user', content: 'time?' }], tools: [{ type: 'function', function: { name: 'get_time' } }] });
  return { gpu: ctx.gpu, devices: ctx.devices, lib: ctx.androidLib, content: res.content, reasoning: res.reasoning_content, finalSeen: seen[seen.length - 1], timings: res.timings, tools: tools.tool_calls, tok: (await ctx.tokenize('x')).tokens };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.content === 'Hello world' && r.reasoning === 'Let me think.' && r.tools?.[0]?.function?.arguments === '{"tz":"UTC"}' && r.gpu === true;
console.log(ok ? 'SERVER BACKEND TEST PASSED' : 'SERVER BACKEND TEST FAILED');
await browser.close(); server.close(); process.exit(ok ? 0 : 1);
