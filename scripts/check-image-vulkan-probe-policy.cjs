const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname,
  '../android/app/src/main/java/ai/offgridmobile/localdream/AtlasNativeDiffusion.kt'), 'utf8');
const check = source.indexOf('if (preferGpu && !probeEnumerated)');
const assignment = source.indexOf('val gpuRequested = preferGpu');
const processStart = source.indexOf('val proc = ProcessBuilder(cmd)');
assert.ok(check >= 0 && check < assignment && assignment < processStart,
  'Reject missing Vulkan backend before launching the diffusion process');
assert.match(source, /No usable Vulkan diffusion GPU was detected/, 'Explain missing GPU');
assert.match(source, /No CPU fallback occurred/, 'Retain explicit GPU-only policy');
assert.doesNotMatch(source, /GPU probe inconclusive; trying native Vulkan directly/,
  'Never force Vulkan after a failed probe');
console.log('PASS image Vulkan probe gate and explicit CPU fallback policy');
