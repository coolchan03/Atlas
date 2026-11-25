// Turns CommonJS-style `require('...')` calls in the app source (src/, App.tsx) into ES imports.
// React Native (Metro) lets code call require() anywhere: lazily to break import cycles, or for
// bundled assets (`require('./logo.png')`). Rollup/Vite is ESM only, so this plugin hoists each
// require into a top-level import. Namespace imports stay live bindings, so a require that used
// to run late (inside a function) still reads the finished module when it is evaluated.
import type { Plugin } from 'vite';
import path from 'node:path';

const ASSET = /\.(png|jpe?g|gif|webp|svg|ttf|otf|mp3|wav|ogg|m4a|bin|onnx|txt|md|html|pdf|csv)$/i;
const REQ = /(?<![\w$.])require\(\s*(['"])([^'"\n]+)\1\s*\)/g;

export function rnRequire(root: string): Plugin {
  const slash = (p: string) => p.replace(/\\/g, '/');
  const srcDir = slash(path.join(root, 'src')) + '/';
  const appFile = slash(path.join(root, 'App.tsx'));
  return {
    name: 'atlas-rn-require',
    enforce: 'pre',
    transform(code, id) {
      const file = slash(id.split('?')[0]);
      if (!(file.startsWith(srcDir) || file === appFile)) return null;
      if (!/\.(tsx?|jsx?)$/.test(file)) return null;
      if (!code.includes('require(')) return null;
      const names = new Map<string, string>();
      let n = 0;
      const lines = code.split('\n');
      let changed = false;
      const out = lines.map((line) => {
        const t = line.trimStart();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return line;
        return line.replace(REQ, (_m, _q, spec: string) => {
          // Node built-ins and the rejection tracker are handled by aliases; everything else is hoisted.
          const asset = ASSET.test(spec);
          const key = (asset ? 'a:' : spec.endsWith('.json') ? 'j:' : 'n:') + spec;
          let name = names.get(key);
          if (!name) {
            name = `__rq${n++}`;
            names.set(key, name);
          }
          changed = true;
          return asset || spec.endsWith('.json') ? name : `__rqi(${name})`;
        });
      });
      if (!changed) return null;
      const imports: string[] = [];
      for (const [key, name] of names) {
        const spec = key.slice(2);
        if (key.startsWith('n:')) imports.push(`import * as ${name} from ${JSON.stringify(spec)};`);
        else imports.push(`import ${name} from ${JSON.stringify(spec)};`);
      }
      imports.push(`import { requireInterop as __rqi } from '@atlas-web/requireInterop';`);
      return { code: imports.join('\n') + '\n' + out.join('\n'), map: null };
    },
  };
}
