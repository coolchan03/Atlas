/** A patch for a package that is no longer installed fails the whole build ("Patch file found for package ... which is not present"). */
import fs from 'fs';
import path from 'path';

it('every patch in patches/ is for a package that is in package.json', () => {
  const root = path.join(__dirname, '../..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const missing = fs.readdirSync(path.join(root, 'patches')).filter((f) => f.endsWith('.patch'))
    .map((f) => f.replace(/\.patch$/, '').replace(/\+\d[\w.-]*$/, '').replace('+', '/'))
    .filter((name) => !deps.has(name));
  expect(missing).toEqual([]);
});
