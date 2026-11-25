// WebGPU engine check (needs a WebGPU adapter; in CI/sandbox a software one: --use-webgpu-adapter=swiftshader).
// Loads a small MLC model through the app's own engine layer and generates a reply. usage: node scripts/webgpu-e2e.mjs [url] [modelId]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const url = process.argv[2] || 'http://localhost:4173/';
const model = process.argv[3] || 'SmolLM2-360M-Instruct-q4f32_1-MLC';
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__atlas, null, { timeout: 30000 });
const r = await page.evaluate(async (model) => {
  const a = window.__atlas; const out = {};
  const listed = await a.NativeModules.DeviceMemoryModule.getMemoryInfo(); out.mem = !!listed;
  // the same path the Models screen takes: a download of the pseudo file, then initLlama on it
  const done = new Promise((res, rej) => { const o1 = a.bus.addListener('DownloadComplete', (e) => { o1.remove(); res(e); }); a.bus.addListener('DownloadError', (e) => rej(new Error(e.reason))); });
  let t = performance.now();
  const url = `https://huggingface.co/mlc-ai/${model}/resolve/main/${model}.webgpu.gguf`;
  const st = await a.NativeModules.DownloadManagerModule.startDownload({ url, fileName: `${model}.webgpu.gguf`, modelId: `mlc-ai/${model}`, totalBytes: 400e6 });
  await done; out.fetchMs = Math.round(performance.now() - t);
  // The app itself (running in this page) finalises finished downloads by moving them into the models folder.
  const want = `/atlas/files/models/${model}.webgpu.gguf`;
  for (let i = 0; i < 40 && !(await a.fs().exists(want)); i++) await new Promise((r) => setTimeout(r, 250));
  const path = (await a.fs().exists(want)) ? want : await a.NativeModules.DownloadManagerModule.moveCompletedDownload(st.downloadId, want);
  const { initLlama } = await a.llama();
  t = performance.now();
  const ctx = await initLlama({ model: path, n_ctx: 1024 }); out.loadMs = Math.round(performance.now() - t); out.engine = ctx.androidLib; out.gpu = ctx.gpu; out.devices = ctx.devices;
  t = performance.now();
  const res = await ctx.completion({ messages: [{ role: 'user', content: 'Say hello in five words.' }], n_predict: 24, temperature: 0.2 });
  out.genMs = Math.round(performance.now() - t); out.reply = res.content; out.tokens = res.tokens_predicted;
  await ctx.release();
  return out;
}, model);
console.log(JSON.stringify(r, null, 1));
await browser.close();
process.exit(r.reply ? 0 : 1);
