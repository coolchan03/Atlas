/**
 * The bundled files are most of the APK (about 166 MB of assets: six NPU generations, the embedding model, tokenizers; and the native libraries kept in
 * jniLibs). The full build keeps all of them on purpose, and the lean per-chip build (-PatlasQnnChip) drops the other NPU generations. This only stops the
 * total growing unnoticed: adding a large file fails here until the ceiling is raised on purpose, with the reason in the commit.
 */
import * as fs from 'fs';
import * as path from 'path';

const MB = 1024 * 1024;
const root = path.join(__dirname, '../../android/app/src/main');
const CEILING_MB = { assets: 170, jniLibs: 14 };

function sizeOf(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? sizeOf(p) : fs.statSync(p).size;
  }
  return total;
}

function biggest(dir: string, out: Array<[string, number]> = []): Array<[string, number]> {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) biggest(p, out); else out.push([path.relative(root, p), fs.statSync(p).size]);
  }
  return out;
}

describe('bundled file size', () => {
  it.each(Object.entries(CEILING_MB))('%s stays under its ceiling', (name, ceiling) => {
    const mb = sizeOf(path.join(root, name)) / MB;
    const worst = biggest(path.join(root, name)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} (${(n / MB).toFixed(1)} MB)`).join(', ');
    expect({ name, mb: Math.round(mb), ok: mb <= ceiling, largest: mb > ceiling ? worst : undefined }).toEqual({ name, mb: Math.round(mb), ok: true, largest: undefined });
  });

  it('keeps every NPU generation in the full build (the lean build is a separate, opt-in switch)', () => {
    const gradle = fs.readFileSync(path.join(root, '../../build.gradle'), 'utf8');
    expect(gradle).toMatch(/def leanChip = project\.findProperty\('atlasQnnChip'\)/);
    expect(gradle).toContain("'V68', 'V69', 'V73', 'V75', 'V79', 'V81'");
  });
});
