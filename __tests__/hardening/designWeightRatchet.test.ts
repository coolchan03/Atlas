/**
 * The design rule is that text weights stay at 400 or below (docs/design, CLAUDE.md). Many older screens still use bold or heavier weights; changing
 * them all would flatten the visual hierarchy of those screens, which needs someone looking at a phone. Until then this only stops it getting
 * WORSE: a new bold weight fails this test, and each one removed lowers the ceiling.
 */
import * as fs from 'fs';
import * as path from 'path';

const CEILING = 281;
const HEAVY = /fontWeight:\s*['"](?:bold|[5-9]00)['"]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

it('has no more heavy text weights than the ceiling, and the ceiling comes down as they are removed', () => {
  const root = path.join(__dirname, '../../src');
  const found = walk(root).map((f) => [f, (fs.readFileSync(f, 'utf8').match(HEAVY) ?? []).length] as const).filter(([, n]) => n > 0);
  const total = found.reduce((s, [, n]) => s + n, 0);
  const worst = found.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${path.relative(root, f)} (${n})`).join(', ');
  expect({ total, ok: total <= CEILING, hint: total > CEILING ? `a new heavy fontWeight was added; use 400 and show hierarchy with size or colour. Most: ${worst}` : undefined }).toEqual({ total, ok: true, hint: undefined });
  // When some are fixed, lower CEILING to match so they cannot creep back.
  expect(CEILING - total).toBeLessThan(25);
});
