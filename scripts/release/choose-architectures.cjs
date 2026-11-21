// Which CPU types a release APK is built for. Every ordinary release is 64-bit ARM only (the phones Atlas runs on, and the build that takes about
// an hour). The other types (32-bit ARM, x86 and x86_64, for older phones and emulators) are built every `every` builds (20 by default, 10 on
// request), when native code the other types also compile has changed, and whenever someone asks for a full build by hand.
const ARM64 = 'arm64-v8a';
const ALL = 'arm64-v8a,armeabi-v7a,x86_64,x86';
/** Files whose change means native code was rebuilt, so the other CPU types must be rebuilt with it. */
const NATIVE_CHANGE = /^(android\/patches\/|android\/app\/src\/main\/cpp\/|android\/app\/src\/main\/jni\/|scripts\/prepare-llamakt-vulkan\.cjs$)/;

function architecturesFor({ build, every = 20, manualFull = false, changedFiles = [] }) {
  const n = Number(every) === 10 ? 10 : 20; // only the two documented intervals: a typo cannot turn this off or on every build
  if (manualFull) return { abis: ALL, why: 'a full build was asked for' };
  const native = changedFiles.find((f) => NATIVE_CHANGE.test(f));
  if (native) return { abis: ALL, why: `native code changed (${native})` };
  if (Number.isInteger(Number(build)) && Number(build) > 0 && Number(build) % n === 0) return { abis: ALL, why: `build ${build} is a multiple of ${n}` };
  return { abis: ARM64, why: 'an ordinary release builds 64-bit ARM only' };
}

module.exports = { architecturesFor, ARM64, ALL };

if (require.main === module) {
  const [build, every, manual, ...changed] = process.argv.slice(2);
  const r = architecturesFor({ build, every, manualFull: manual === 'true', changedFiles: changed.filter(Boolean) });
  process.stdout.write(`${r.abis}\n`);
  process.stderr.write(`Architectures: ${r.abis} (${r.why})\n`);
}
