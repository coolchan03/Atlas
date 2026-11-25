// Builds a tiny ZIM file (zstd + stored clusters, redirect, metadata), loads it in a real browser and checks
// open / title search / article text through the AtlasKiwix module. usage: node scripts/zim-test.mjs [url]
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

function buildZim() {
  const mimes = ['text/html', 'text/plain'];
  // entries: [ns, url, title, kind, payload]  kind: 'html' | 'meta' | 'redirect'
  const raw = [
    ['C', 'Albert_Einstein', 'Albert Einstein', 'html', '<html><body><h1>Albert Einstein</h1><p>Albert Einstein developed the theory of relativity.</p><script>x()</script></body></html>', 0],
    ['C', 'Main_Page', 'Main Page', 'html', '<html><body><p>Welcome to the test library.</p></body></html>', 0],
    ['C', 'Quantum', 'Quantum', 'redirect', 'Quantum_mechanics'],
    ['C', 'Quantum_mechanics', 'Quantum mechanics', 'html', '<html><body><p>Quantum mechanics describes nature at small scales.</p></body></html>', 1],
    ['M', 'Language', 'Language', 'meta', 'eng', 1],
    ['M', 'Title', 'Title', 'meta', 'Test Library', 1],
  ].sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
  // two clusters: 0 = stored, 1 = zstd
  const clusterBlobs = [[], []];
  const dirs = raw.map((e) => {
    if (e[3] === 'redirect') return { e, idx: raw.findIndex((x) => x[1] === e[4]) };
    const c = e[5]; clusterBlobs[c].push(Buffer.from(e[4])); return { e, cluster: c, blob: clusterBlobs[c].length - 1 };
  });
  const mkCluster = (blobs, compress) => {
    const n = blobs.length; const offs = Buffer.alloc((n + 1) * 4); let pos = (n + 1) * 4;
    blobs.forEach((b, i) => { offs.writeUInt32LE(pos, i * 4); pos += b.length; }); offs.writeUInt32LE(pos, n * 4);
    const body = Buffer.concat([offs, ...blobs]);
    return Buffer.concat([Buffer.from([compress ? 5 : 1]), compress ? zlib.zstdCompressSync(body) : body]);
  };
  const clusters = [mkCluster(clusterBlobs[0], false), mkCluster(clusterBlobs[1], true)];
  const mimeList = Buffer.from(mimes.join('\0') + '\0\0');
  const direntBufs = dirs.map((d) => {
    const url = Buffer.from(d.e[1] + '\0'), title = Buffer.from((d.e[2] === d.e[1] ? '' : d.e[2]) + '\0');
    if (d.e[3] === 'redirect') { const h = Buffer.alloc(12); h.writeUInt16LE(0xffff, 0); h[2] = 0; h[3] = d.e[0].charCodeAt(0); h.writeUInt32LE(0, 4); h.writeUInt32LE(d.idx, 8); return Buffer.concat([h, url, title]); }
    const h = Buffer.alloc(16); h.writeUInt16LE(d.e[3] === 'meta' ? 1 : 0, 0); h[3] = d.e[0].charCodeAt(0); h.writeUInt32LE(d.cluster, 8); h.writeUInt32LE(d.blob, 12); return Buffer.concat([h, url, title]);
  });
  const n = raw.length;
  const headerLen = 80, mimeAt = headerLen, urlPtrAt = mimeAt + mimeList.length, titlePtrAt = urlPtrAt + n * 8, clusterPtrAt = titlePtrAt + n * 4;
  let pos = clusterPtrAt + clusters.length * 8;
  const direntAt = []; direntBufs.forEach((b) => { direntAt.push(pos); pos += b.length; });
  const clusterAt = []; clusters.forEach((b) => { clusterAt.push(pos); pos += b.length; });
  const checksumAt = pos;
  const hdr = Buffer.alloc(80); hdr.writeUInt32LE(72173914, 0); hdr.writeUInt16LE(6, 4); hdr.writeUInt16LE(1, 6);
  hdr.writeUInt32LE(n, 24); hdr.writeUInt32LE(clusters.length, 28);
  hdr.writeBigUInt64LE(BigInt(urlPtrAt), 32); hdr.writeBigUInt64LE(BigInt(titlePtrAt), 40); hdr.writeBigUInt64LE(BigInt(clusterPtrAt), 48); hdr.writeBigUInt64LE(BigInt(mimeAt), 56);
  hdr.writeUInt32LE(raw.findIndex((e) => e[1] === 'Main_Page'), 64); hdr.writeUInt32LE(0xffffffff, 68); hdr.writeBigUInt64LE(BigInt(checksumAt), 72);
  const urlPtr = Buffer.alloc(n * 8); direntAt.forEach((o, i) => urlPtr.writeBigUInt64LE(BigInt(o), i * 8));
  const order = raw.map((e, i) => [e[0] + (e[2] || e[1]), i]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]);
  const titlePtr = Buffer.alloc(n * 4); order.forEach((idx, i) => titlePtr.writeUInt32LE(idx, i * 4));
  const clusterPtr = Buffer.alloc(clusters.length * 8); clusterAt.forEach((o, i) => clusterPtr.writeBigUInt64LE(BigInt(o), i * 8));
  return Buffer.concat([hdr, mimeList, urlPtr, titlePtr, clusterPtr, ...direntBufs, ...clusters, Buffer.alloc(16)]);
}

const url = process.argv[2] || 'http://localhost:4173/';
const zimB64 = buildZim().toString('base64');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__atlas, null, { timeout: 30000 });
const r = await page.evaluate(async (b64) => {
  const a = window.__atlas; const K = a.NativeModules.AtlasKiwix; const out = {};
  await a.rnfs.writeFile('/atlas/files/library/t.zim', b64, 'base64');
  out.info = await K.openFile('/atlas/files/library/t.zim');
  const P = '/atlas/files/library/t.zim';
  out.s1 = (await K.search([P], 'Quantum', 5)).map((h) => `${h.title}->${h.path}`);
  out.s2 = (await K.search([P], 'albert', 5)).map((h) => `${h.title}->${h.path}`);
  out.art = await K.getArticle(P, 'Albert_Einstein', 500);
  out.redirect = (await K.getArticle(P, 'Quantum', 500)).title;
  return out;
}, zimB64);
console.log(JSON.stringify(r, null, 1));
const ok = r.info.title === 'Test Library' && r.s1.some((x) => x.includes('Quantum mechanics')) && r.s2.some((x) => x.startsWith('Albert Einstein')) && /relativity/.test(r.art.text) && !/x\(\)/.test(r.art.text) && r.redirect === 'Quantum mechanics';
console.log(ok ? 'ZIM TEST PASSED' : 'ZIM TEST FAILED');
await browser.close(); process.exit(ok ? 0 : 1);
