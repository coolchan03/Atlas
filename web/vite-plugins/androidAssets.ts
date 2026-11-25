// The Android app ships a few files inside the APK (the MiniLM embedding model, fonts). The web build
// serves the same files under <base>/android-assets/ so RNFS.copyFileAssets works unchanged.
import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export function androidAssets(root: string): Plugin {
  const src = path.join(root, 'android/app/src/main/assets');
  const SKIP = new Set(['qnnlibs', 'ggml-hexagon', 'cvtbase']); // native Android libraries: useless in a browser
  let outDir = '';
  return {
    name: 'atlas-android-assets',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/android-assets\/(.+?)(\?.*)?$/.exec(req.url ?? '');
        if (!m) return next();
        const file = path.join(src, decodeURIComponent(m[1]));
        if (!file.startsWith(src) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      if (!fs.existsSync(src)) return;
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        fs.cpSync(path.join(src, e.name), path.join(outDir, 'android-assets', e.name), { recursive: true });
      }
    },
  };
}
