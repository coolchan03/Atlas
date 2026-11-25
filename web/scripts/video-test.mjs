// Saves a two-slide narrated video through the AtlasVideo module (canvas + MediaRecorder) and checks the file.
// usage: node scripts/video-test.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const b = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext({ acceptDownloads: true })).newPage();
p.on('console', (m) => { if (m.type() === 'error') console.error('[c]', m.text().slice(0, 200)); });
await p.goto(process.argv[2] || 'http://localhost:4173/', { waitUntil: 'load' });
await p.waitForFunction(() => window.__atlas);
const r = await p.evaluate(async () => {
  const a = window.__atlas, V = a.NativeModules.AtlasVideo;
  if (!V) return { error: 'AtlasVideo is not registered' };
  const wav = (secs) => { const rate = 16000, n = rate * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 20) * 6000, true); return new Uint8Array(buf); };
  await a.rnfs.mkdir('/atlas/files/tmp');
  const { toBase64 } = { toBase64: (u) => btoa(String.fromCharCode(...u)) };
  await a.rnfs.writeFile('/atlas/files/tmp/s0.wav', toBase64(wav(2)), 'base64');
  await a.rnfs.writeFile('/atlas/files/tmp/s1.wav', toBase64(wav(2)), 'base64');
  const events = [];
  a.bus.addListener('AtlasVideoProgress', (e) => events.push(e.stage));
  const specs = [{ title: 'Why the sky is blue', bullets: ['Sunlight holds every colour', 'Air scatters blue light most'], wav: '/atlas/files/tmp/s0.wav' },
                 { title: 'Sunsets', bullets: ['The light crosses more air', 'Blue is scattered out first'], wav: '/atlas/files/tmp/s1.wav' }];
  const t0 = performance.now();
  const out = await V.exportSlides(JSON.stringify(specs), 'Sky test');
  const stat = await a.rnfs.stat(out.uri.replace('file://', ''));
  return { out, size: Number(stat.size), secs: (performance.now() - t0) / 1000, events: [...new Set(events)] };
});
console.log(JSON.stringify(r));
const ok = !r.error && r.size > 5000 && r.secs > 4;
console.log(ok ? 'VIDEO TEST PASSED' : 'VIDEO TEST FAILED');
process.exitCode = ok ? 0 : 1;
await b.close();
