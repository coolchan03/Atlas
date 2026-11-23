/**
 * Which CPU types a release builds, and how the APKs reach the Releases page: one signed APK for each CPU type (64-bit ARM, 32-bit ARM, x86_64, x86), each built and
 * checked in its own job, all added to one release that is published last. The workflow cannot be run in the test environment, so its wiring is pinned here.
 */
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml');

const wf = yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/atlas-apk.yml'), 'utf8'));
const apk = wf.jobs.apk;
const steps: any[] = apk.steps;
const named = (re: RegExp) => steps.find((s) => re.test(s.name ?? ''));
const ALL = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'];

/** Evaluates the matrix expression the way GitHub does for the cases that matter (an empty input is an empty string, as GitHub reads a missing one). */
function matrixFor(ctx: { event: string; publish?: boolean; all?: boolean; minify?: boolean; chip?: string; test?: string }): string[] {
  const inner = (apk.strategy.matrix.abi as string).replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  const inputs = { publish: ctx.publish ?? false, all_architectures: ctx.all ?? false, minify_trial: ctx.minify ?? false, qnn_chip: ctx.chip ?? '', test_abis: ctx.test ?? '' };
  // eslint-disable-next-line no-new-func
  return new Function('fromJSON', 'github', 'inputs', `return ${inner};`)(JSON.parse, { event_name: ctx.event }, inputs);
}

describe('the CPU types of a build', () => {
  const expr: string = apk.strategy.matrix.abi;

  it('is a valid expression that gives every CPU type for a publish or a full build, and 64-bit ARM only otherwise', () => {
    expect(matrixFor({ event: 'workflow_dispatch', publish: true })).toEqual(ALL);
    expect(matrixFor({ event: 'workflow_dispatch', all: true })).toEqual(ALL);
    expect(matrixFor({ event: 'workflow_dispatch' })).toEqual(['arm64-v8a']); // a test build
    expect(matrixFor({ event: 'push' })).toEqual(['arm64-v8a']); // a push to a stable branch
    expect(matrixFor({ event: 'schedule' })).toEqual(['arm64-v8a']);
    expect(matrixFor({ event: 'workflow_dispatch', publish: true, minify: true })).toEqual(['arm64-v8a']); // a shrunk trial is never published
    expect(matrixFor({ event: 'workflow_dispatch', publish: true, chip: 'V79' })).toEqual(['arm64-v8a']); // nor a lean build
    expect(matrixFor({ event: 'workflow_dispatch', test: '["x86_64","x86"]' })).toEqual(['x86_64', 'x86']); // a list given by hand wins
  });

  it('is a job for each CPU type, which does not stop the others when one fails', () => {
    expect(apk.strategy['fail-fast']).toBe(false);
    for (const abi of ALL) expect(expr).toContain(`"${abi}"`);
    expect(apk.name).toContain('matrix.abi');
  });

  it('is every CPU type when publishing or when asked for, and 64-bit ARM only for a test build, a shrunk trial or a lean build', () => {
    expect(expr).toMatch(/inputs\.publish == true \|\| inputs\.all_architectures == true/);
    expect(expr).toContain("inputs.minify_trial != true && inputs.qnn_chip == ''");
    expect(expr).toMatch(/\|\| '\["arm64-v8a"\]'\)\) \}\}$/); // the default
    expect(expr).toContain("inputs.test_abis != '' && inputs.test_abis"); // a list given by hand wins, to try one CPU type without the 64-bit ARM build
    expect(wf.on.workflow_dispatch.inputs.all_architectures.default).toBe(false);
    expect(wf.on.workflow_dispatch.inputs.architecture_every).toBeUndefined(); // the "every 20th build" rule is gone
  });

  it('sets the CPU type before anything that depends on it, and builds with it', () => {
    const set = steps.indexOf(named(/Set the CPU type of this job/));
    expect(set).toBeGreaterThan(-1);
    expect(set).toBeLessThan(steps.indexOf(named(/Get natural-voice engine/)));
    const build: string = named(/Build release APK/).run;
    expect(build).toContain('-PreactNativeArchitectures=${{ steps.abis.outputs.abis }}');
    expect(build).toContain('-PatlasNoNpu=${{ steps.abis.outputs.multiarch }}'); // the NPU files only go into the 64-bit ARM APK
    expect(build).toContain("-PatlasVulkanEnabled=${{ steps.abis.outputs.multiarch == 'true' && 'false' || 'true' }}");
    expect(named(/Get natural-voice engine/).run).toContain('matrix.abi'); // each APK keeps only its own CPU type's voice engine
  });

  it('builds the image engines for 64-bit ARM only', () => {
    for (const re of [/Restore the image engines/, /Build native ARM64 diffusion CLI/, /Build OpenCL ARM64 diffusion CLI/, /Save the image engines/]) expect(named(re).if).toContain("matrix.abi == 'arm64-v8a'");
  });

  it('keeps the quick compile gate and the 64-bit ARM checks, and gives the other CPU types their own', () => {
    expect(named(/Kotlin compile gate/).run).toContain('-PreactNativeArchitectures=arm64-v8a');
    const verify: string = named(/Verify release native runtime/).run;
    expect(verify).toContain('lib/arm64-v8a/librnllama.so');
    expect(verify).toContain('lib/$ABI/libonnxruntime.so');
    expect(verify).toContain('contains $other libraries'); // a reduced APK must not carry another CPU type's libraries
    expect(verify).toContain('carries NPU files');
    expect(verify).toContain('lib/x86_64/librnllama');
  });
});

describe('publishing', () => {
  it('makes a draft release first, adds each APK to it from its own job, and publishes last', () => {
    const prepare = wf.jobs.prepare;
    expect(prepare.if).toContain('inputs.publish == true');
    expect(prepare.steps.some((s: any) => /gh release create/.test(s.run ?? '') && /--draft/.test(s.run))).toBe(true);
    expect(apk.needs).toBe('prepare');
    expect(apk.if).toContain("needs.prepare.result == 'skipped'"); // a test build skips `prepare` and must still build
    const add = named(/Add this APK to the release/);
    expect(add.run).toContain('gh release upload atlas-${{ github.run_number }} out/*.apk --clobber');
    expect(add.if).toContain('inputs.publish == true');
    expect(wf.jobs.finish.needs).toEqual(['prepare', 'apk']);
  });

  it('needs the 64-bit ARM APK on the release to publish, and only warns about another CPU type that is missing', () => {
    const run: string = wf.jobs.finish.steps[0].run;
    expect(run).toContain('Atlas-${{ github.run_number }}\\.apk$');
    expect(run).toMatch(/exit 1/);
    for (const abi of ['armeabi-v7a', 'x86_64', 'x86']) expect(run).toContain(abi);
    expect(run).toContain('::warning title=Missing APK::');
    expect(run).toContain('gh release edit "$TAG" -R "$REPO" --draft=false $kind');
    expect(run).toContain('--prerelease');
  });

  it('names each APK by its CPU type, and keeps the 64-bit ARM build file named Atlas-apk (the official publish workflow takes it)', () => {
    expect(named(/Rename APK/).run).toContain("format('-{0}', steps.abis.outputs.abis)");
    const upload = steps.find((s) => s.uses?.startsWith('actions/upload-artifact') && s.with?.name === "${{ (inputs.minify_trial == true && 'Atlas-apk-R8-TRIAL') || (inputs.qnn_chip != '' && format('Atlas-apk-LEAN-{0}', inputs.qnn_chip)) || 'Atlas-apk' }}");
    expect(upload.if).toContain("matrix.abi == 'arm64-v8a'");
    const other = named(/Keep this CPU type's APK as a build file/);
    expect(other.if).toContain('inputs.publish != true'); // a published build puts them on the release, not in the 500 MB of saved build files
  });

  it('still publishes the 64-bit ARM APK on a push to a stable branch, as before', () => {
    const push = named(/Publish release \(a push to a stable branch\)/);
    expect(push.if).toContain("github.event_name == 'push'");
    expect(push.run).toContain('gh release create atlas-${{ github.run_number }} out/*.apk --latest');
  });

  it('lets only the 64-bit ARM job save the shared Gradle cache', () => {
    expect(named(/Save the Gradle caches/).if).toContain("matrix.abi == 'arm64-v8a'");
  });
});
