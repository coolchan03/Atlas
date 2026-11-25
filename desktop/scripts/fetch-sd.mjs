// Downloads the stable-diffusion.cpp Windows builds the app bundles (sd-cli.exe + DLLs) into resources/sd/<variant>/.
//   node scripts/fetch-sd.mjs                       cpu + vulkan, latest release
//   SD_TAG=master-123abcd SD_VARIANTS=cpu node scripts/fetch-sd.mjs
// GITHUB_TOKEN (optional) raises the API rate limit. Variants: cpu (AVX2, any recent x64 PC), vulkan (NVIDIA / AMD / Intel GPUs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'resources', 'sd');
const tag = process.env.SD_TAG || 'latest';
const variants = (process.env.SD_VARIANTS || 'cpu,vulkan').split(',').map((s) => s.trim()).filter(Boolean);
const headers = { 'User-Agent': 'atlas-build', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

const PICK = {
  cpu: [/bin-win-avx2-x64\.zip$/, /win.*avx2.*x64.*\.zip$/i, /win.*cpu.*x64.*\.zip$/i],
  vulkan: [/bin-win-vulkan-x64\.zip$/, /win.*vulkan.*x64.*\.zip$/i],
};
const find = (assets, res) => { for (const re of res) { const a = assets.find((x) => re.test(x.name)); if (a) return a; } return null; };
const EXE = ['sd-cli.exe', 'sd.exe'];

const list = tag === 'latest'
  ? await (await fetch('https://api.github.com/repos/leejet/stable-diffusion.cpp/releases?per_page=30', { headers })).json()
  : [await (await fetch(`https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/tags/${tag}`, { headers })).json()];
if (!Array.isArray(list)) throw new Error(`Could not read the stable-diffusion.cpp releases (${list?.message || 'unexpected answer'})`);
const rel = list.find((r) => r.assets && variants.every((v) => find(r.assets, PICK[v] || [])));
if (!rel) {
  for (const r of list.slice(0, 3)) console.log(`release ${r.tag_name}: ${(r.assets || []).map((a) => a.name).join(', ') || '(no assets)'}`);
  throw new Error(`No recent stable-diffusion.cpp release has Windows builds for: ${variants.join(', ')}`);
}
console.log(`stable-diffusion.cpp ${rel.tag_name}`);
console.log(`assets: ${rel.assets.map((a) => a.name).join(', ')}`);

fs.rmSync(out, { recursive: true, force: true });
for (const v of variants) {
  const asset = find(rel.assets, PICK[v]);
  console.log(`  ${asset.name} (${(asset.size / 1048576).toFixed(0)} MB)`);
  const files = unzipSync(new Uint8Array(await (await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'atlas-build' } })).arrayBuffer()));
  const dest = path.join(out, v);
  fs.mkdirSync(dest, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    if (!name.endsWith('/')) fs.writeFileSync(path.join(dest, path.basename(name)), data);
  }
  console.log(`  ${v}: ${fs.readdirSync(dest).join(', ')}`);
  if (!EXE.some((e) => fs.existsSync(path.join(dest, e)))) throw new Error(`${v}: no ${EXE.join(' or ')} in the archive`);
}
fs.writeFileSync(path.join(out, 'VERSION.txt'), `${rel.tag_name}\n`);
console.log('done ->', out);
