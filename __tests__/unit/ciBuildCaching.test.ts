/**
 * The Android build keeps compiled native objects between runs and says what it spent. Pinned here because it cannot be run in the test
 * environment: the policy is that a cache can only miss, never serve a stale object, and that a missing ccache never fails a build.
 */
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml');

const root = path.join(__dirname, '../..');
const wf = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/atlas-apk.yml'), 'utf8'));
const steps: any[] = wf.jobs[Object.keys(wf.jobs)[0]].steps;
const named = (re: RegExp) => steps.find((s) => re.test(s.name ?? ''));

describe('native compiler cache', () => {
  it('is set up after the NDK is known, and only when ccache could be installed', () => {
    const setup = named(/Set up the C\/C\+\+ compiler cache/);
    expect(steps.indexOf(setup)).toBeGreaterThan(steps.findIndex((s) => /ATLAS_NDK/.test(s.run ?? '')));
    expect(setup.run).toContain('CMAKE_C_COMPILER_LAUNCHER=ccache');
    expect(setup.run).toContain('CMAKE_CXX_COMPILER_LAUNCHER=ccache');
    expect(setup.run).toContain('apt-get install -y ccache');
    expect(setup.run).toMatch(/\|\| true/); // a failed install is not a failed build
    for (const dependent of [/Restore the compiler cache/, /Zero the compiler cache counters/, /Save the compiler cache/]) expect(named(dependent).if).toContain("steps.ccache.outputs.available == 'true'");
  });

  it('compares the compiler by content and keys the cache on the NDK and the architecture, so an outdated object can only miss', () => {
    const setup = named(/Set up the C\/C\+\+ compiler cache/);
    expect(setup.run).toContain('CCACHE_COMPILERCHECK=content');
    const key: string = named(/Restore the compiler cache/).with.key;
    expect(key).toContain('arm64');
    expect(key).toContain('steps.ccache.outputs.ndk');
    expect(named(/Restore the compiler cache/).with['restore-keys']).toContain('steps.ccache.outputs.ndk');
  });

  it('is saved even when a later step fails, and comes before the release build starts', () => {
    expect(named(/Save the compiler cache/).if).toContain('always()');
    expect(steps.indexOf(named(/Restore the compiler cache/))).toBeLessThan(steps.indexOf(named(/Build release APK/)));
  });

  it('is reported with the APK size breakdown, and the report can never fail the build', () => {
    const report = named(/Report compiler cache use and APK size/);
    expect(report.if).toBe('always()');
    expect(report.run).toContain('GITHUB_STEP_SUMMARY');
    expect(report.run).toMatch(/\|\| true\s*$/);
  });

  it('leaves an ARM64-only release build as it was', () => {
    expect(named(/Build release APK/).run).toContain('-PreactNativeArchitectures=arm64-v8a');
  });
});

describe('Gradle configuration cache', () => {
  const props = fs.readFileSync(path.join(root, 'android/gradle.properties'), 'utf8');
  it('is on, and a plugin that cannot be cached only costs the cache entry, never the build', () => {
    expect(props).toMatch(/^org\.gradle\.configuration-cache=true$/m);
    expect(props).toMatch(/^org\.gradle\.configuration-cache\.problems=warn$/m);
  });
});
