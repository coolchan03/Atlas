// One version everywhere: package.json, the lockfile's root entry and android/app/build.gradle must agree, and the release notes
// (docs/ATLAS_RELEASE_0.0.105.md) must have an entry for it, because the published release shows that entry. Run in CI before a build.
const fs = require('node:fs');
const path = require('node:path');

function versions(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const pkg = JSON.parse(read('package.json')).version;
  const lock = JSON.parse(read('package-lock.json'));
  const gradle = /versionName\s+"([^"]+)"/.exec(read('android/app/build.gradle'))?.[1];
  const notes = read('docs/ATLAS_RELEASE_0.0.105.md');
  return { pkg, lock: lock.version, lockRoot: lock.packages?.['']?.version, gradle, hasNotes: new RegExp(`^- ${pkg.replace(/\./g, '\\.')}\\b`, 'm').test(notes) };
}

/** The problems found (an empty list means the version is consistent). */
function problems(v) {
  const out = [];
  for (const [name, value] of [['package-lock.json (top)', v.lock], ['package-lock.json (root package)', v.lockRoot], ['android/app/build.gradle versionName', v.gradle]]) {
    if (value !== v.pkg) out.push(`${name} is ${value ?? 'missing'}, package.json is ${v.pkg}`);
  }
  if (!v.hasNotes) out.push(`docs/ATLAS_RELEASE_0.0.105.md has no "- ${v.pkg}:" entry, so the release would show the wrong notes`);
  return out;
}

module.exports = { versions, problems };

if (require.main === module) {
  const found = problems(versions(path.join(__dirname, '..', '..')));
  if (found.length) { console.error(`Version check failed:\n- ${found.join('\n- ')}`); process.exit(1); }
  console.log('Version check passed: package.json, lockfile, build.gradle and the release notes agree.');
}
