'use strict';
// Drives lib/sd.cjs against the REAL sd-cli (the Windows build fetched by scripts/fetch-sd.mjs) with a real model.
//   node test/sd-real.cjs <resources/sd dir> <work dir>   (work/models/turbo/{model.gguf,atlas-image.json} must exist)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sd = require('../lib/sd.cjs');

const [resources, work] = process.argv.slice(2);
const real = (p) => (p.startsWith('/atlas/') ? path.join(work, 'data', p) : p);
const events = [];
sd.init(resources, { real, virtual: (p) => p, onProgress: (e) => events.push(e) });
assert.ok(sd.available(), 'no sd-cli in ' + resources);

(async () => {
  const gpu = sd.probe('vulkan');
  console.log('vulkan probe:', JSON.stringify({ enumerated: gpu.enumerated, detail: gpu.detail.slice(0, 200) }));
  const t0 = Date.now();
  const r = await sd.generate({
    modelDir: path.join(work, 'models', 'turbo'), outputDir: path.join(work, 'out'),
    params: { prompt: 'a small red house on a green hill, watercolor', steps: 4, width: 256, height: 256, seed: 7, guidanceScale: 1.0, computeBackend: 'cpu', previewInterval: 2 },
  });
  console.log('generated', JSON.stringify(r), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  assert.equal(r.width, 256); assert.equal(r.height, 256);
  assert.ok(fs.statSync(r.imagePath).size > 10000, 'a real picture, not an empty file');
  console.log('progress events:', JSON.stringify(events.map((e) => [e.step, !!e.previewPath])));
  assert.deepEqual(events.map((e) => e.step), [1, 2, 3, 4], 'one event per diffusion step');
  const st = sd.status();
  console.log('status:', JSON.stringify({ stage: st.stage, running: st.running }));
  console.log('SD REAL TEST PASSED');
})().catch((e) => { console.error(e); console.log('SD REAL TEST FAILED'); process.exit(1); });
