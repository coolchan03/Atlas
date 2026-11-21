/**
 * Which CPU types a release builds: 64-bit ARM for an ordinary release, everything every 20th build (10 on request), when native code changed, and when
 * asked for by hand. The workflow wires the script in; both are pinned here because the workflow cannot be run in the test environment.
 */
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { architecturesFor, ARM64, ALL } = require('../../scripts/release/choose-architectures.cjs');

describe('architecturesFor', () => {
  it('is 64-bit ARM only for an ordinary release', () => {
    for (const build of [1, 19, 21, 239]) expect(architecturesFor({ build }).abis).toBe(ARM64);
  });

  it('builds every type every 20th build by default and every 10th on request', () => {
    expect(architecturesFor({ build: 240 }).abis).toBe(ALL);
    expect(architecturesFor({ build: 250 }).abis).toBe(ARM64);
    expect(architecturesFor({ build: 250, every: '10' }).abis).toBe(ALL);
    expect(architecturesFor({ build: 235, every: 7 }).abis).toBe(ARM64); // only 20 or 10: a typo cannot change the policy
  });

  it('builds every type when native code the other types compile changed, and when a full build is asked for', () => {
    expect(architecturesFor({ build: 241, changedFiles: ['android/patches/llama.patch'] })).toMatchObject({ abis: ALL, why: expect.stringContaining('native code changed') });
    expect(architecturesFor({ build: 241, changedFiles: ['src/screens/HomeScreen.tsx', 'docs/x.md'] }).abis).toBe(ARM64);
    expect(architecturesFor({ build: 241, manualFull: true }).abis).toBe(ALL);
  });

  it('ignores a build number that is not a positive whole number', () => {
    for (const build of ['', 'abc', 0, -20, undefined]) expect(architecturesFor({ build }).abis).toBe(ARM64);
  });
});

describe('atlas-apk.yml', () => {
  const wf = yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/atlas-apk.yml'), 'utf8'));
  const steps: any[] = wf.jobs[Object.keys(wf.jobs)[0]].steps;
  const named = (re: RegExp) => steps.find((s) => re.test(s.name ?? ''));

  it('offers a full build and the 10-build interval by hand', () => {
    expect(wf.on.workflow_dispatch.inputs.all_architectures.default).toBe(false);
    expect(wf.on.workflow_dispatch.inputs.architecture_every.default).toBe('20');
  });

  it('chooses the types before anything that depends on them, and builds with the choice', () => {
    const choose = steps.indexOf(named(/Choose the CPU types/));
    expect(choose).toBeGreaterThan(-1);
    expect(choose).toBeLessThan(steps.indexOf(named(/Get natural-voice engine/)));
    expect(named(/Build release APK/).run).toContain('-PreactNativeArchitectures=${{ steps.abis.outputs.abis }}');
    expect(named(/Get natural-voice engine/).run).toContain('steps.abis.outputs.multiarch');
  });

  it('keeps the quick compile gate and the ARM64 checks as they were', () => {
    expect(named(/Kotlin compile gate/).run).toContain('-PreactNativeArchitectures=arm64-v8a');
    expect(named(/Verify release native runtime/).run).toContain('lib/arm64-v8a/librnllama.so');
  });
});
