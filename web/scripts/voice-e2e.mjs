// Round trip in a real browser: Kokoro speaks a sentence to a WAV file, Whisper transcribes it back.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__atlas, null, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const a = window.__atlas; const r = {}; const N = a.NativeModules;
  let t = performance.now();
  r.speakers = await N.AtlasTts.setNeuralVoice('kokoro-v1-en', 3); r.loadTtsMs = Math.round(performance.now() - t);
  t = performance.now();
  await N.AtlasTts.synthesizeToFile('Atlas works offline on your device.', '/atlas/files/say.wav', 'en-US'); r.synthMs = Math.round(performance.now() - t);
  r.wavBytes = (await a.rnfs.stat('/atlas/files/say.wav')).size;
  const { initWhisper } = await a.whisper();
  // The app's own speech-model download (ggml .bin URL): replaced by the ONNX model + marker file.
  const done = new Promise((res, rej) => { const off = a.bus.addListener('DownloadComplete', (e) => { off.remove(); res(e); }); a.bus.addListener('DownloadError', (e) => rej(new Error(e.reason))); });
  t = performance.now();
  const started = await N.DownloadManagerModule.startDownload({ url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin', fileName: 'ggml-tiny.en.bin', modelId: 'whisper-tiny.en' });
  await done; r.whisperDownloadMs = Math.round(performance.now() - t);
  const dest = await N.DownloadManagerModule.moveCompletedDownload(started.downloadId, '/atlas/files/whisper-models/ggml-tiny.en.bin');
  const ctx = await initWhisper({ filePath: dest });
  t = performance.now();
  const { promise } = ctx.transcribe('/atlas/files/say.wav', { language: 'en' });
  const tr = await promise; r.transcribeMs = Math.round(performance.now() - t); r.transcript = tr.result; r.segments = tr.segments.length;
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
