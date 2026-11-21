// Writes docs/ATLAS_ROUTE_MATRIX.md: every RootStack route with the acceptance columns of the audit, all "not tested" until a person fills them in.
// Existing rows (and what was written in them) are kept; new routes are added; routes that no longer exist are marked removed.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/navigation/AppNavigator.tsx'), 'utf8');
const routes = [...new Set([...source.matchAll(/RootStack\.Screen name="([A-Za-z0-9]+)"/g)].map((m) => m[1]))].sort();
const out = path.join(root, 'docs/ATLAS_ROUTE_MATRIX.md');
const COLUMNS = ['route', 'reachable', 'controls checked', 'empty', 'error', 'compact portrait', 'compact landscape', 'tablet portrait', 'tablet landscape', 'TalkBack', 'light/dark', 'comments', 'commit', 'reviewer'];
const NOT = 'not tested';

const existing = new Map();
if (fs.existsSync(out)) {
  for (const line of fs.readFileSync(out, 'utf8').split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length === COLUMNS.length && !/^-+$/.test(cells[0]) && cells[0] !== 'route') existing.set(cells[0].replace(/~~/g, ''), cells);
  }
}
const rows = routes.map((r) => existing.get(r) ?? [r, ...COLUMNS.slice(1, 11).map(() => NOT), '', '', '']);
const removed = [...existing.keys()].filter((r) => !routes.includes(r)).map((r) => { const c = existing.get(r); return [`~~${r}~~`, ...c.slice(1, 11), 'route removed', c[12], c[13]]; });
const table = [COLUMNS, COLUMNS.map(() => '---'), ...rows, ...removed].map((c) => `| ${c.join(' | ')} |`).join('\n');
fs.writeFileSync(out, `# Atlas route acceptance matrix\n\nOne row per RootStack route. Every cell starts as "${NOT}". Fill a row in only after the route was checked on a real device: absence of a bug report is never a pass.\nRegenerate with \`node scripts/route-matrix.cjs\`; rows you filled in are kept.\n\n${table}\n`);
console.log(`${routes.length} routes written to docs/ATLAS_ROUTE_MATRIX.md`);
