// End-to-end engine check in a real browser: download a tiny GGUF through the app's file layer, load it with the
// llama.rn shim (wllama in the browser) and generate a reply. usage: node scripts/llm-e2e.mjs [url] [modelUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const url = process.argv[2] || 'http://localhost:4173/';
const modelUrl = process.argv[3] || 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => { if (['error'].includes(m.type())) console.log('[console]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__atlas, null, { timeout: 30000 });
const out = await page.evaluate(async (modelUrl) => {
  const a = window.__atlas; const t0 = performance.now(); const r = {};
  const dl = a.rnfs.downloadFile({ fromUrl: modelUrl, toFile: '/atlas/files/models/test.gguf' });
  await dl.promise; r.downloadMs = Math.round(performance.now() - t0);
  r.size = (await a.rnfs.stat('/atlas/files/models/test.gguf')).size;
  const { initLlama } = await a.llama();
  const t1 = performance.now();
  const ctx = await initLlama({ model: '/atlas/files/models/test.gguf', n_ctx: 1024, n_threads: 3 });
  r.loadMs = Math.round(performance.now() - t1); r.engine = ctx.androidLib; r.gpu = ctx.gpu; r.model = ctx.model.desc;
  let tokens = 0;
  const t2 = performance.now();
  const res = await ctx.completion({ messages: [{ role: 'user', content: 'Say hello in five words.' }], n_predict: 24, temperature: 0.2 }, () => { tokens++; });
  r.genMs = Math.round(performance.now() - t2); r.tokens = tokens; r.text = res.content; r.timings = res.timings;
  r.tok = (await ctx.tokenize('hello world')).tokens.length;
  await ctx.release();
  return r;
}, modelUrl);
console.log(JSON.stringify(out, null, 1));
await browser.close();
