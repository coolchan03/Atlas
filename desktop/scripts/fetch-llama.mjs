// Downloads the llama.cpp Windows builds the app bundles (llama-server.exe + DLLs) into resources/llama/<variant>/.
//   node scripts/fetch-llama.mjs                      cpu + vulkan, latest release
//   LLAMA_TAG=b6800 LLAMA_VARIANTS=cpu,vulkan,cuda node scripts/fetch-llama.mjs
// GITHUB_TOKEN (optional) raises the API rate limit. Variants: cpu (any x64 PC), vulkan (NVIDIA / AMD / Intel
// GPUs), cuda (NVIDIA, adds the CUDA runtime DLLs: roughly +400 MB).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'resources', 'llama');
const tag = process.env.LLAMA_TAG || 'latest';
const variants = (process.env.LLAMA_VARIANTS || 'cpu,vulkan').split(',').map((s) => s.trim()).filter(Boolean);
const headers = { 'User-Agent': 'atlas-build', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

const PICK = {
  cpu: [/bin-win-cpu-x64\.zip$/, /bin-win-avx2-x64\.zip$/, /win.*(cpu|avx2).*x64.*\.zip$/i],
  vulkan: [/bin-win-vulkan-x64\.zip$/, /win.*vulkan.*x64.*\.zip$/i],
  cuda: [/bin-win-cuda-12[\d.]*-x64\.zip$/, /bin-win-cuda-cu12[\d.]*-x64\.zip$/, /win.*cuda.*12.*x64.*\.zip$/i],
};
const CUDART = [/^cudart-.*cuda-12[\d.]*-x64\.zip$/, /^cudart-.*cu12[\d.]*-x64\.zip$/, /^cudart.*x64.*\.zip$/i];
const find = (assets, res, cudart = false) => { for (const re of res) { const a = assets.find((x) => re.test(x.name) && (cudart || !x.name.startsWith('cudart'))); if (a) return a; } return null; };

// The newest release is not always a full set of builds (some releases carry only source or a few platforms): take the
// first recent release that has every variant asked for, and say what was seen when none does.
const list = tag === 'latest'
  ? await (await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30', { headers })).json()
  : [await (await fetch(`https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${tag}`, { headers })).json()];
if (!Array.isArray(list)) throw new Error(`Could not read the llama.cpp releases (${list?.message || 'unexpected answer'})`);
let rel = null;
for (const r of list) {
  if (!r.assets) continue;
  if (variants.every((v) => find(r.assets, PICK[v] || []))) { rel = r; break; }
}
if (!rel) {
  for (const r of list.slice(0, 3)) console.log(`release ${r.tag_name}: ${(r.assets || []).map((a) => a.name).join(', ') || '(no assets)'}`);
  throw new Error(`No recent llama.cpp release has Windows builds for: ${variants.join(', ')}`);
}
console.log(`llama.cpp ${rel.tag_name}`);

async function extract(asset, dest) {
  console.log(`  ${asset.name} (${(asset.size / 1048576).toFixed(0)} MB)`);
  const buf = new Uint8Array(await (await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'atlas-build' } })).arrayBuffer());
  const files = unzipSync(buf);
  fs.mkdirSync(dest, { recursive: true });
  // Flatten: the executable and its DLLs end up side by side whatever folder they were zipped in.
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    fs.writeFileSync(path.join(dest, path.basename(name)), data);
  }
}

fs.rmSync(out, { recursive: true, force: true });
for (const v of variants) {
  const asset = find(rel.assets, PICK[v] || []);
  if (!asset) { console.warn(`! no ${v} build in this release, skipped`); continue; }
  const dest = path.join(out, v);
  await extract(asset, dest);
  if (v === 'cuda') { const rt = find(rel.assets, CUDART, true); if (rt) await extract(rt, dest); else console.warn('! no cudart package found'); }
  const exe = path.join(dest, 'llama-server.exe');
  if (!fs.existsSync(exe)) throw new Error(`${v}: llama-server.exe is missing from the archive`);
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'VERSION.txt'), `${rel.tag_name}\n`);
console.log('done ->', out);
