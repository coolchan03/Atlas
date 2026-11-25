'use strict';
// Runs llama.cpp's llama-server as a child process, one per loaded model. The renderer talks to it over
// loopback HTTP (see web/src/engines/llm/serverBackend.ts). Builds are tried best first: CUDA, Vulkan, CPU.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');

let resourcesDir = '';
const servers = new Map();
let seq = 1;
let capsCache = null;
let progressSink = () => {};

function init(dir, onProgress) {
  resourcesDir = dir;
  progressSink = onProgress || (() => {});
}

const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
function variantDir(v) { return path.join(resourcesDir, v); }
function exeFor(v) {
  const p = path.join(variantDir(v), exeName);
  return fs.existsSync(p) ? p : null;
}

/** Which builds exist, and which GPU backends they report. Cached. */
function capabilities() {
  if (capsCache) return capsCache;
  const variants = ['cuda', 'vulkan', 'cpu'].filter(exeFor);
  const backends = [];
  const devices = {};
  for (const v of variants) {
    if (v === 'cpu') { backends.push('cpu'); continue; }
    try {
      const r = spawnSync(exeFor(v), ['--list-devices'], { encoding: 'utf8', timeout: 20000, windowsHide: true, cwd: variantDir(v) });
      const out = `${r.stdout || ''}\n${r.stderr || ''}`;
      const list = out.split(/\r?\n/).filter((l) => /^\s*(CUDA|Vulkan|Metal|SYCL|ROCm)\d*:/i.test(l)).map((l) => l.trim());
      if (list.length) { backends.push(v); devices[v] = list; }
    } catch { /* this build cannot run here (missing driver / DLL) */ }
  }
  if (!backends.includes('cpu') && variants.includes('cpu')) backends.push('cpu');
  capsCache = { available: variants.length > 0, variants, backends, devices };
  return capsCache;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function waitHealthy(port, child, deadlineMs, onTick) {
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`llama-server stopped while loading (exit code ${child.exitCode})`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.status === 200) return;
    } catch { /* not listening yet */ }
    if (Date.now() - t0 > deadlineMs) throw new Error('The model took too long to load');
    onTick?.();
    await new Promise((res) => setTimeout(res, 400));
  }
}

function buildArgs(o, port, variant) {
  const gpu = variant !== 'cpu' && (o.n_gpu_layers ?? 99) !== 0;
  const a = ['-m', o.model, '--host', '127.0.0.1', '--port', String(port), '-c', String(o.n_ctx || 4096), '-np', '1', '--no-webui', '--jinja', '--reasoning-format', 'deepseek'];
  if (o.n_threads) a.push('-t', String(o.n_threads));
  if (o.n_batch) a.push('-b', String(o.n_batch));
  a.push('-ngl', gpu ? String(o.n_gpu_layers && o.n_gpu_layers > 0 ? o.n_gpu_layers : 999) : '0');
  if (o.flash_attn) a.push('-fa', 'on');
  if (o.cache_type_k && o.cache_type_k !== 'f16') a.push('--cache-type-k', String(o.cache_type_k));
  if (o.cache_type_v && o.cache_type_v !== 'f16') a.push('--cache-type-v', String(o.cache_type_v));
  if (o.use_mmap === false) a.push('--no-mmap');
  if (o.embedding) a.push('--embedding', '--pooling', 'mean');
  if (o.mmproj) { a.push('--mmproj', o.mmproj); if (o.mmprojGpu === false) a.push('--no-mmproj-offload'); }
  return a;
}

async function start(o) {
  const caps = capabilities();
  if (!caps.available) throw new Error('This build of Atlas has no bundled llama.cpp engine.');
  const wantGpu = (o.n_gpu_layers ?? 99) !== 0;
  const order = wantGpu ? ['cuda', 'vulkan', 'cpu'] : ['cpu'];
  const tried = [];
  let lastErr = null;
  for (const variant of order) {
    if (!caps.variants.includes(variant)) continue;
    if (variant !== 'cpu' && !caps.backends.includes(variant)) { tried.push(`${variant}: no device`); continue; }
    try { return await startVariant(o, variant, tried); } catch (e) { lastErr = e; tried.push(`${variant}: ${e.message}`); }
  }
  throw lastErr || new Error(`No engine could load this model. ${tried.join('; ')}`);
}

async function startVariant(o, variant, tried) {
  const port = await freePort();
  const id = `ls${seq++}`;
  const args = buildArgs(o, port, variant);
  const child = spawn(exeFor(variant), args, { cwd: variantDir(variant), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  const devices = [];
  let nLayers, gpuLayers = 0, loaded = 0;
  const onLine = (line) => {
    log.push(line); if (log.length > 400) log.shift();
    let m;
    if ((m = /offloaded (\d+)\/(\d+) layers/i.exec(line))) { gpuLayers = Number(m[1]); nLayers = Number(m[2]); loaded = Math.max(loaded, 60); }
    if (/^\s*(CUDA|Vulkan)\d*:/i.test(line) || /found \d+ (CUDA|Vulkan) devices/i.test(line) || /using device/i.test(line)) devices.push(line.trim());
    if (/load_tensors|llm_load_tensors/.test(line)) loaded = Math.max(loaded, 40);
    if (/llama_context|kv_cache/.test(line)) loaded = Math.max(loaded, 80);
    if (/model loaded|server is listening/i.test(line)) loaded = 99;
  };
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (d) => { buf += d.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } });
  }
  const entry = { child, port, variant, log };
  servers.set(id, entry);
  child.on('exit', () => { if (servers.get(id) === entry) servers.delete(id); });
  try {
    progressSink(id, 3);
    let lastSent = 0;
    await waitHealthy(port, child, 15 * 60 * 1000, () => { if (loaded !== lastSent) { lastSent = loaded; progressSink(id, loaded); } });
  } catch (e) {
    try { child.kill(); } catch { /* gone */ }
    servers.delete(id);
    throw new Error(`${e.message}. Last lines: ${log.slice(-6).join(' | ')}`);
  }
  progressSink(id, 100);
  let props = {}; let meta = {};
  try { props = await (await fetch(`http://127.0.0.1:${port}/props`)).json(); } catch { /* optional */ }
  try { meta = ((await (await fetch(`http://127.0.0.1:${port}/v1/models`)).json()).data || [])[0]?.meta || {}; } catch { /* optional */ }
  const gpu = variant !== 'cpu' && gpuLayers > 0;
  return {
    id, port,
    backend: variant === 'cuda' ? 'CUDA' : variant === 'vulkan' ? 'Vulkan' : 'CPU',
    devices: devices.length ? devices.slice(0, 4) : (capabilities().devices?.[variant] || []),
    nLayers, gpuLayers: gpu ? gpuLayers : 0,
    reasonNoGPU: gpu ? '' : variant === 'cpu' && wantGpuFailed(tried) ? `GPU engine unavailable (${tried.join('; ')}). Running on the CPU.` : (variant === 'cpu' ? 'Running on the CPU.' : 'The GPU did not take any layers.'),
    metadata: { 'general.architecture': meta.arch || '', 'general.name': path.basename(o.model), [`${meta.arch || 'llama'}.context_length`]: String(meta.n_ctx_train || ''), 'llama.n_params': String(meta.n_params || '') },
    nCtx: props.default_generation_settings?.n_ctx || o.n_ctx || 4096,
    vision: !!props.modalities?.vision,
  };
}
const wantGpuFailed = (tried) => tried.length > 0;

async function stop(id) {
  const e = servers.get(id);
  if (!e) return;
  servers.delete(id);
  await new Promise((res) => { e.child.once('exit', res); try { e.child.kill(); } catch { res(); } setTimeout(res, 3000); });
}
function stopAll() { for (const [id, e] of servers) { try { e.child.kill(); } catch { /* gone */ } servers.delete(id); } }

function systemInfo() {
  return { platform: process.platform, arch: process.arch, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model || '', totalMem: os.totalmem(), freeMem: os.freemem() };
}

module.exports = { init, start, stop, stopAll, capabilities, systemInfo };
