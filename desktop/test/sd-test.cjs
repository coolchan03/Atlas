'use strict';
// Tests the pure parts of the image engine manager and one generation against the stand-in engine (test/fake-sd).
//   node test/sd-test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sd = require('../lib/sd.cjs');

assert.equal(sd.parseStep('  |=====>   | 3/8 - 1.20s/it', 8), 3);
assert.equal(sd.parseStep('sampling 3/4 of 1/2', 8), null, 'only ratios of the requested step count count');
assert.equal(sd.parseStep('|=| 9/8', 8), null);
assert.deepEqual(sd.parseDevices('Available devices:\nvulkan0\tNVIDIA RTX\nCPU\tfoo\nvulkan1\tIntel').map((d) => d.name), ['vulkan0', 'vulkan1']);
assert.equal(sd.isStalled(1_000_000, 0, 0, true, 0), true);
assert.equal(sd.isStalled(5 * 60_000, 0, 0, true, 0), false);

const base = { primary: '/m/model.gguf', attachments: {}, loras: [], loraDir: '/m/support/lora', output: '/o.png', previewPattern: '/p/step_%04d.png', runtime: null, prompt: 'a cat' };
const cpu = sd.buildArgs({ ...base, family: 'sd15', variant: 'base', params: { steps: 4, seed: 7, guidanceScale: 20 }, gpu: false });
assert.deepEqual(cpu.slice(0, 2), ['-m', '/m/model.gguf']);
assert.equal(cpu[cpu.indexOf('--cfg-scale') + 1], '15', 'guidance is clamped to 15');
assert.equal(cpu[cpu.indexOf('--backend') + 1], 'cpu');
const gpu = sd.buildArgs({ ...base, family: 'sd15', variant: 'base', params: {}, gpu: true, device: 'vulkan0', f16: true });
assert.equal(gpu[gpu.indexOf('--backend') + 1], 'diffusion=vulkan0,te=cpu,vae=cpu');
assert.ok(gpu.includes('--type') && gpu.includes('f16'));
const flux = sd.buildArgs({ ...base, family: 'flux', variant: 'base', attachments: { vae: '/v', clip_l: '/c', t5xxl: '/t' }, params: { negativePrompt: 'x', guidanceScale: 7 }, gpu: false });
assert.equal(flux[0], '--diffusion-model');
assert.equal(flux[flux.indexOf('--cfg-scale') + 1], '1');
assert.ok(!flux.includes('-n'), 'FLUX takes no negative prompt');
assert.throws(() => sd.buildArgs({ ...base, family: 'flux', variant: 'base', params: {}, gpu: false, runtime: { schedule: 'ays' } }), /ays/);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sd-'));
  const model = path.join(dir, 'model');
  fs.mkdirSync(model, { recursive: true });
  fs.writeFileSync(path.join(model, 'model.safetensors'), Buffer.from('x'));
  fs.writeFileSync(path.join(model, 'atlas-image.json'), JSON.stringify({ family: 'sd15', variant: 'base', primary: 'model.safetensors', support: [] }));
  const steps = [];
  sd.init(path.join(__dirname, 'fake-sd'), { real: (p) => p, virtual: (p) => p, onProgress: (e) => steps.push(e) });
  assert.equal(sd.available(), true);
  assert.equal(sd.probe('vulkan').enumerated, true);
  for (const computeBackend of ['vulkan', 'cpu']) {
    steps.length = 0;
    const r = await sd.generate({ modelDir: model, outputDir: path.join(dir, 'out'), params: { prompt: 'a red house', width: 256, height: 320, steps: 4, seed: 5, computeBackend } });
    assert.equal(r.width, 256); assert.equal(r.height, 320); assert.equal(r.seed, 5);
    assert.ok(fs.statSync(r.imagePath).size > 100);
    assert.deepEqual(steps.map((s) => s.step), [1, 2, 3, 4], `progress on ${computeBackend}`);
    assert.ok(steps.some((s) => s.previewPath), 'a preview picture is reported');
  }
  // cancel
  const running = sd.generate({ modelDir: model, outputDir: path.join(dir, 'out'), params: { prompt: 'x', steps: 40, width: 256, height: 256 } });
  setTimeout(() => sd.cancel(), 500);
  await assert.rejects(running, /cancel/i);
  assert.equal(fs.readdirSync(path.join(dir, 'out')).length, 2, 'a cancelled run leaves no picture');
  // missing components
  fs.writeFileSync(path.join(model, 'atlas-image.json'), JSON.stringify({ family: 'flux', variant: 'base', primary: 'model.safetensors', support: [] }));
  await assert.rejects(sd.generate({ modelDir: model, outputDir: path.join(dir, 'out'), params: { prompt: 'x' } }), /missing required components: vae, clip_l, t5xxl/);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('SD TEST PASSED');
})().catch((e) => { console.error(e); console.log('SD TEST FAILED'); process.exit(1); });
