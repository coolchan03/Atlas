const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const archive = path.resolve(__dirname, '..', 'android/app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(archive)) throw new Error('Full Atlas release APK missing: ' + archive);
const entries = execFileSync('unzip', ['-Z', '-1', archive], { encoding:'utf8' }).trim().split(/\r?\n/);
if (!entries.includes('lib/arm64-v8a/libllamakt.so')) throw new Error('Vulkan runtime libllamakt.so missing from ARM64 APK');
if (!entries.some(name => /^lib\/arm64-v8a\/lib.*rnllama.*\.so$/i.test(name)))
  throw new Error('Existing llama.rn CPU/OpenCL engine missing from ARM64 APK');
if (!entries.some(name => /^classes(\d+)?\.dex$/.test(name)))
  throw new Error('APK Android classes/dex missing');
console.log('PASS Atlas Vulkan APK contains independent Vulkan and existing llama.rn runtime libraries');
