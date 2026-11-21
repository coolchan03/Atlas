const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const aar = path.resolve(__dirname, '..', process.argv[2] || 'android/atlasLlamaKt/build/outputs/aar/atlasLlamaKt-release.aar');
assert.ok(fs.existsSync(aar), 'Vulkan Android AAR was not built: ' + aar);
const entries = execFileSync('unzip', ['-Z1', aar], { encoding: 'utf8' }).split(/\r?\n/);
for (const name of ['classes.jar', 'jni/arm64-v8a/libllamakt.so', 'jni/arm64-v8a/libOpenCL.so']) {
  assert.ok(entries.includes(name), 'Missing required source-built AAR entry: ' + name);
}
assert.ok(!entries.some(e => /librnllama/i.test(e)), 'Do not replace Atlas JSI native libraries');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-vulkan-elf-'));
try {
  const binary = path.join(scratch, 'libllamakt.so');
  fs.writeFileSync(binary, execFileSync('unzip', ['-p', aar, 'jni/arm64-v8a/libllamakt.so'], { maxBuffer: 256 * 1024 * 1024 }));
  const elf = execFileSync('readelf', ['-d', binary], { encoding: 'utf8' });
  assert.match(elf, /libvulkan\.so/, 'libllamakt must dynamically link system Vulkan');
  const exported = execFileSync('nm', ['-D', binary], { encoding: 'utf8' });
  assert.match(exported, /Java_com_tensai_llamakt_LlamaEngine_nativeListBackends/, 'JNI backend probe missing');
  const phdr = execFileSync('readelf', ['-lW', binary], { encoding: 'utf8' });
  const aligns = [...phdr.matchAll(/^\s*LOAD\s+.*\s+(0x[0-9a-fA-F]+)\s*$/gm)].map(m => Number.parseInt(m[1], 16));
  assert.ok(aligns.length && aligns.every(n => n >= 16384), 'Android 16KB ELF page alignment missing: ' + aligns.join(','));
  console.log('PASS Vulkan/OpenCL Android AAR: arm64 JNI, Vulkan link, 16KB load segments, CPU isolation');
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
