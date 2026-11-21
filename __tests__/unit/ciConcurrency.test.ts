/**
 * CI concurrency policy: a newer dev build replaces an older one, but a build that publishes is never cancelled by another commit,
 * a stale automatic publish is skipped, and workflows that upload to a shared release run one at a time.
 */
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml');

const load = (name: string): any => yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows', name), 'utf8'));
const evalCancel = (expr: unknown, ctx: { publish?: boolean; ref: string; event?: string }): boolean => {
  if (typeof expr === 'boolean') return expr;
  // The two expression shapes used here, evaluated by hand (the real evaluator is GitHub's).
  const stable = ctx.publish === true || ctx.ref === 'refs/heads/atlas-voice' || ctx.ref === 'refs/heads/claude/atlas-voice-music-home-widgets';
  if (String(expr).includes('github.event_name')) return ctx.event === 'push';
  return !stable;
};

describe('atlas-apk.yml', () => {
  const wf = load('atlas-apk.yml');

  it('lets a newer dev build on the same branch replace an older one', () => {
    expect(evalCancel(wf.concurrency['cancel-in-progress'], { ref: 'refs/heads/claude/some-feature' })).toBe(true);
  });

  it('never cancels a build that publishes, whether by branch or by manual publish', () => {
    expect(evalCancel(wf.concurrency['cancel-in-progress'], { ref: 'refs/heads/atlas-voice' })).toBe(false);
    expect(evalCancel(wf.concurrency['cancel-in-progress'], { ref: 'refs/heads/claude/some-feature', publish: true })).toBe(false);
  });

  it('keeps branches apart (a build on one branch never cancels another)', () => {
    expect(wf.concurrency.group).toContain('github.ref');
  });

  it('checks that an automatic publish is still the newest commit, and a manual publish is exempt', () => {
    const steps: any[] = wf.jobs.apk.steps;
    const guard = steps.find((s) => s.id === 'head');
    const publish = steps.find((s) => /^Publish release/.test(s.name ?? ''));
    expect(guard.run).toContain('git ls-remote origin');
    expect(guard.if).toBe("github.event_name == 'push'");
    expect(steps.indexOf(guard)).toBeLessThan(steps.indexOf(publish));
    expect(publish.if).toContain("steps.head.outputs.stale != 'true'");
    expect(publish.if).toContain('inputs.publish == true ||'); // explicit choice wins
  });
});

describe('other workflows', () => {
  it('Android unit tests: a newer push on a branch replaces the older run', () => {
    const c = load('atlas-android-tests.yml').concurrency;
    expect(c['cancel-in-progress']).toBe(true);
    expect(c.group).toContain('github.ref');
  });

  it.each(['atlas-native-image.yml', 'atlas-vulkan-experimental.yml'])('%s: a push replaces an older push build; a run started by hand is never cancelled', (name) => {
    const c = load(name).concurrency;
    expect(evalCancel(c['cancel-in-progress'], { ref: 'refs/heads/x', event: 'push' })).toBe(true);
    expect(evalCancel(c['cancel-in-progress'], { ref: 'refs/heads/x', event: 'workflow_dispatch' })).toBe(false);
    expect(c.group).toContain('github.event_name');
  });

  it.each(['atlas-packs.yml', 'atlas-voices.yml'])('%s uploads to a shared release one run at a time and is never cancelled halfway', (name) => {
    const c = load(name).concurrency;
    expect(c['cancel-in-progress']).toBe(false);
    expect(c.group).toBeTruthy();
  });

  it('the official publish workflow is never cancelled', () => {
    expect(load('atlas-official-publish.yml').concurrency['cancel-in-progress']).toBe(false);
  });
});
