/** Source-level guardrails. Android compilation and real-device testing remain required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const dir = 'android/app/src/main/java/ai/offgridmobile/localdream/';
const cli = read(dir + 'AtlasNativeDiffusion.kt');
const mod = read(dir + 'LocalDreamModule.kt');
const js = read('src/services/localDreamGenerator.ts');
const types = read('src/types/index.ts');
const files = read(dir + 'AtlasImageFiles.kt');
const progress = read(dir + 'AtlasImageProgress.kt');
const tests = read('android/app/src/test/java/ai/offgridmobile/localdream/AtlasImageProgressTest.kt');
const workflow = yaml.load(read('.github/workflows/atlas-native-image.yml'));
const steps = workflow.jobs['native-image-apk'].steps;
const at = name => steps.findIndex(step => step.name === name);
const step = name => steps.find(x => x.name === name);
let checked = 0;
function check(label, callback) {
  try { callback(); checked++; process.stdout.write('PASS ' + label + '\n'); }
  catch (e) { process.stderr.write('FAIL ' + label + ': ' + e.message + '\n'); process.exitCode = 1; }
}
check('Extractable Android native image CLI', () => {
  assert.ok(read('android/app/src/main/AndroidManifest.xml').includes('android:extractNativeLibs="true"'),
    'Manifest must extract native executables');
  assert.ok(/useLegacyPackaging\s*=\s*true/.test(read('android/app/build.gradle')),
    'Gradle must extract .so files as on-disk executables');
  assert.match(cli, /libatlas_sdcli\.so/);
});
check('Native and JS runtime progress interfaces agree', () => {
  assert.match(mod, /fun getAtlasImageRuntimeStatus\(/);
  assert.match(js, /getAtlasImageRuntimeStatus\(/);
  for (const key of ['step', 'totalSteps', 'stage', 'computeBackend', 'cpuTicks']) {
    assert.ok(cli.includes('"' + key + '"'), 'Native field missing: ' + key);
    assert.ok(js.includes(key + ':'), 'JS field missing: ' + key);
  }
});
check('No unsupported Android Process.pid() method', () => {
  for (const file of ['AtlasNativeDiffusion.kt', 'LocalDreamModule.kt']) {
    const data = read(dir + file);
    assert.doesNotMatch(data, /\b(?:process|proc|running)\.pid\s*\(/);
    assert.doesNotMatch(data, /\bProcessHandle\b/);
  }
});
check('Image support-file type contract', () => {
  for (const kind of ['vae', 'llm', 't5xxl', 'clip_l', 'lora', 'upscaler']) {
    assert.ok(files.includes('"' + kind + '"'), 'Missing native support kind: ' + kind);
    assert.ok(types.includes("'" + kind + "'"), 'Missing JS support kind: ' + kind);
  }
});
check('GPU selection and watchdog protections exist', () => {
  for (const token of ['--list-devices', 'diffusion=$vulkanDevice', '--max-vram',
    'Vulkan GPU requested (unverified)', 'watchdogTimedOut', 'isStalled(', 'stream closed',
    'if (!completed && output.exists()) output.delete()']) {
    assert.ok(cli.includes(token), 'Missing native safety protection: ' + token);
  }
  assert.match(progress, /fun isStalled\(/);
  assert.match(tests, /staleNativeDiffusionIsBounded/);
});
check('Vulkan probe parser is test-backed and contains no hidden control characters', () => {
  const parsed = read(dir + 'AtlasVulkanProbe.kt');
  const test = read('android/app/src/test/java/ai/offgridmobile/localdream/AtlasVulkanProbeTest.kt');
  assert.match(cli, /AtlasVulkanProbe\.device\(/);
  assert.match(cli, /redirectOutput\(log\)/);
  assert.match(cli, /configureNativeEnvironment\(/);
  assert.match(cli, /probeGpu\(\)/);
  assert.match(mod, /fun getAtlasImageGpuDiagnostics\(/);
  assert.match(js, /getNativeImageGpuDiagnostics\(/);
  assert.match(parsed, /vulkan\[0-9\]/);
  assert.match(test, /parsesRealSdCliTabDelimitedDeviceOutput/);
  for (const native of [cli, parsed, test, mod]) {
    assert.doesNotMatch(native, /[\x00-\x08\x0b\x0c\x0e-\x1f]/,
      'Hidden control byte detected in native code (regression of invalid Vulkan regex)');
  }
});
check('Native build pins and includes Vulkan C++ and SPIRV headers', () => {
  const build = step('Build native ARM64 diffusion CLI from pinned upstream source')?.run;
  assert.ok(build, 'Native compiler step missing');
  for (const token of ['-DSD_VULKAN=ON', 'SPIRV-Headers_DIR=',
    'Vulkan_INCLUDE_DIR=', 'CMAKE_CXX_FLAGS=-I/tmp/atlas-spirv-install/include',
    'vulkan.hpp', 'spirv.hpp', 'readelf']) {
    assert.ok(build.includes(token), 'Missing build input: ' + token);
  }
});
check('Android tests precede Vulkan compilation', () => {
  assert.ok(at('Test native image family classifier and progress diagnostics') >= 0);
  assert.ok(at('Test native image family classifier and progress diagnostics') <
    at('Build native ARM64 diffusion CLI from pinned upstream source'));
});
check('Strict TypeScript and release Kotlin compilation', () => {
  const typecheck = step('TypeScript compile check')?.run;
  assert.ok(typecheck?.includes('tsc --noEmit'));
  assert.doesNotMatch(typecheck, /\|\|\s*true/);
  assert.ok(step('Test native image family classifier and progress diagnostics')?.run.includes(':app:compileReleaseKotlin'));
});
check('Failed Android tests upload diagnostics', () => {
  assert.equal(step('Upload Android diagnostics on failure')?.if, 'failure()');
});
if (!process.exitCode) process.stdout.write('Native image source contract validated: ' + checked + ' checks.\n');
