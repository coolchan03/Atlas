import { readFileSync } from 'fs';
import { join } from 'path';

describe('route acceptance matrix', () => {
  const root = join(__dirname, '..', '..');
  const routes = [...new Set([...readFileSync(join(root, 'src/navigation/AppNavigator.tsx'), 'utf8').matchAll(/RootStack\.Screen name="([A-Za-z0-9]+)"/g)].map((m) => m[1]))];
  const doc = readFileSync(join(root, 'docs/ATLAS_ROUTE_MATRIX.md'), 'utf8');
  it('has a row for every route, so a new screen cannot be forgotten (run node scripts/route-matrix.cjs)', () => {
    const missing = routes.filter((r) => !doc.includes(`| ${r} |`));
    expect(missing).toEqual([]);
  });
  it('never marks a route tested without a reviewer and a commit', () => {
    const rows = doc.split('\n').filter((l) => /^\| [A-Za-z0-9]+ \|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
    for (const cells of rows) {
      if (cells.slice(1, 11).some((c) => c !== 'not tested')) expect([cells[0], !!cells[12] && !!cells[13]]).toEqual([cells[0], true]);
    }
  });
});
