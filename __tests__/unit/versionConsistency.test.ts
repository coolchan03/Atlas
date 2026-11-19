const { problems, versions } = require('../../scripts/release/check-version-consistency.cjs');
import path from 'node:path';

describe('one version everywhere', () => {
  it('holds for this checkout (so a bump that forgets the lockfile, build.gradle or the notes fails here)', () => {
    expect(problems(versions(path.join(__dirname, '..', '..')))).toEqual([]);
  });

  it('names each disagreement', () => {
    expect(problems({ pkg: '0.0.9', lock: '0.0.8', lockRoot: '0.0.9', gradle: undefined, hasNotes: false })).toEqual([
      'package-lock.json (top) is 0.0.8, package.json is 0.0.9',
      'android/app/build.gradle versionName is missing, package.json is 0.0.9',
      'docs/ATLAS_RELEASE_0.0.105.md has no "- 0.0.9:" entry, so the release would show the wrong notes',
    ]);
  });
});
