// Fails the build when a bundled arm64 native library cannot run on a 16 KB-page device:
// every ELF PT_LOAD segment must have p_align >= 0x4000, and each stored .so must start on a 16 KB boundary in the APK.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const archive = path.resolve(process.argv[2] || path.join(__dirname, '..', 'android/app/build/outputs/apk/release/app-release.apk'));
if (!fs.existsSync(archive)) throw new Error('APK missing: ' + archive);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-16kb-'));
execFileSync('unzip', ['-q', '-o', archive, 'lib/arm64-v8a/*.so', '-d', dir]);
const libs = fs.readdirSync(path.join(dir, 'lib/arm64-v8a')).filter((f) => f.endsWith('.so'));
if (!libs.length) throw new Error('No arm64-v8a libraries found in the APK');

const bad = [];
for (const name of libs) {
  const b = fs.readFileSync(path.join(dir, 'lib/arm64-v8a', name));
  if (b.readUInt32BE(0) !== 0x7f454c46 || b[4] !== 2) { bad.push(`${name}: not a 64-bit ELF`); continue; }
  const phoff = Number(b.readBigUInt64LE(0x20)); const phentsize = b.readUInt16LE(0x36); const phnum = b.readUInt16LE(0x38);
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (b.readUInt32LE(o) !== 1) continue; // PT_LOAD
    const align = Number(b.readBigUInt64LE(o + 48));
    if (align < 0x4000) bad.push(`${name}: PT_LOAD p_align=0x${align.toString(16)} (< 0x4000)`);
  }
}
// APK-level alignment of stored (uncompressed) libraries, when zipalign is available.
try { execFileSync('zipalign', ['-c', '-P', '16', '4', archive], { stdio: 'pipe' }); }
catch (e) { if (e.code !== 'ENOENT') bad.push('zipalign -P 16 check failed: ' + String(e.stdout || e.message).split('\n')[0]); else console.warn('zipalign not found; skipped the APK-level 16 KB check'); }
if (bad.length) { console.error('16 KB page-size check FAILED:\n' + bad.join('\n')); process.exit(1); }
console.log(`PASS all ${libs.length} arm64 libraries are 16 KB aligned`);
