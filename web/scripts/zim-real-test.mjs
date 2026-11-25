// Reads a real Kiwix ZIM (default: Wikipedia physics mini, 53 MB) with the in-app reader: header, metadata, title search, article.
// usage: node scripts/zim-real-test.mjs [file.zim]   (downloads the default file to /tmp when no path is given)
import fs from 'node:fs'; import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
let file = process.argv[2];
if (!file) { file = '/tmp/physics.zim'; if (!fs.existsSync(file)) execFileSync('curl', ['-fsSL', '-o', file, process.env.ZIM_URL || 'https://mirror.accum.se/mirror/kiwix.org/zim/wikipedia/wikipedia_en_physics_mini_2026-10.zim']); }
await build({ entryPoints: [new URL('../src/engines/zim/zim.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', outfile: '/tmp/zimlib.mjs', logLevel: 'silent' });
const { Zim } = await import('/tmp/zimlib.mjs');
const fd = fs.openSync(file, 'r'); const size = fs.statSync(file).size;
const z = await Zim.open(async (pos, len) => { const b = Buffer.alloc(Math.min(len, size - pos)); fs.readSync(fd, b, 0, b.length, pos); return new Uint8Array(b); }, size);
const info = await z.info('x');
const hits = await z.suggest('Albert Einstein', 3);
const art = hits[0] && await z.article(hits[0].path);
const ok = info.title && info.articles > 1000 && hits.some((h) => /Einstein/.test(h.title)) && art && /Einstein/.test(art.html);
console.log(JSON.stringify({ info, hits: hits.map((h) => h.title), article: art && art.title }));
console.log(ok ? 'REAL ZIM TEST PASSED' : 'REAL ZIM TEST FAILED'); process.exit(ok ? 0 : 1);
