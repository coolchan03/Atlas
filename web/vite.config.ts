import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rnRequire } from './vite-plugins/rnRequire';
import { jsxInJs } from './vite-plugins/jsxInJs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shim = (name: string) => path.resolve(here, 'src/shims', name);
const webModules = path.resolve(here, 'node_modules');

// Native packages replaced by web implementations. Key = import specifier (exact or `pkg/...` prefix).
const SHIMS: Record<string, string> = {
  'react-native-fs': shim('react-native-fs.ts'),
  '@dr.pogodin/react-native-fs': shim('react-native-fs.ts'),
  'react-native-keychain': shim('keychain.ts'),
  'react-native-device-info': shim('device-info.ts'),
  'react-native-haptic-feedback': shim('haptic-feedback.ts'),
  'react-native-edge-to-edge': shim('edge-to-edge.tsx'),
  'react-native-keyboard-controller': shim('keyboard-controller.tsx'),
  'react-native-reanimated': shim('reanimated.tsx'),
  'react-native-worklets': shim('worklets.ts'),
  'react-native-vector-icons/Feather': shim('icons-feather.tsx'),
  'react-native-vector-icons/MaterialIcons': shim('icons-material.tsx'),
  'react-native-url-polyfill/auto': shim('empty.ts'),
  '@react-native-community/slider': shim('slider.tsx'),
  '@react-native-documents/picker': shim('documents-picker.ts'),
  '@react-native-documents/viewer': shim('documents-viewer.ts'),
  'react-native-image-picker': shim('image-picker.ts'),
  'react-native-zip-archive': shim('zip-archive.ts'),
  'react-native-calendar-events': shim('calendar-events.ts'),
  '@react-native-voice/voice': shim('voice.ts'),
  'react-native-audio-api': shim('audio-api.ts'),
  '@op-engineering/op-sqlite': shim('op-sqlite.ts'),
  'llama.rn': shim('llama-rn.ts'),
  'whisper.rn': shim('whisper-rn.ts'),
  'promise/setimmediate/rejection-tracking': shim('rejection-tracking.ts'),
  '@atlas-web/requireInterop': shim('requireInterop.ts'),
};

// `react-native` resolves to a shim for the app's own code (Alert, Platform, NativeModules ... need
// web behavior) and to react-native-web for everything inside node_modules (react-navigation etc).
function reactNativeResolver(): Plugin {
  const srcDir = path.join(root, 'src') + path.sep;
  const appFile = path.join(root, 'App.tsx');
  const webSrc = path.join(here, 'src') + path.sep;
  return {
    name: 'atlas-react-native-resolver',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const from = importer.split('?')[0];
      if (source === 'react-native') {
        if (from.startsWith(webSrc) && !from.includes(`${path.sep}shims${path.sep}react-native`)) {
          return shim('react-native.ts');
        }
        if (from.startsWith(srcDir) || from === appFile) return shim('react-native.ts');
        return this.resolve('react-native-web', importer, { ...options, skipSelf: true });
      }
      if (source.startsWith('react-native/Libraries/')) return shim('rn-internals.ts');
      if (source === 'react-native/package.json') return path.join(webModules, 'react-native-web/package.json');
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const dev = mode !== 'production';
  const desktop = process.env.ATLAS_TARGET === 'desktop';
  return {
    root: here,
    base: desktop ? './' : process.env.ATLAS_BASE || '/',
    publicDir: path.join(here, 'public'),
    plugins: [
      reactNativeResolver(),
      rnRequire(root),
      jsxInJs(),
      react({ jsxRuntime: 'automatic' }),
      ...(desktop
        ? []
        : [
            VitePWA({
              strategies: 'injectManifest',
              srcDir: 'src/pwa',
              filename: 'sw.ts',
              registerType: 'autoUpdate',
              injectRegister: false,
              manifest: false, // public/manifest.webmanifest is hand written
              injectManifest: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2,ttf,wasm}'],
                maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
              },
              devOptions: { enabled: false },
            }),
          ]),
    ],
    resolve: {
      extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
      alias: [
        ...Object.entries(SHIMS).map(([find, replacement]) => ({
          find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`),
          replacement,
        })),
        { find: /^react$/, replacement: path.join(webModules, 'react/index.js') },
        { find: /^react\/(.*)$/, replacement: path.join(webModules, 'react/$1') },
        { find: /^react-dom$/, replacement: path.join(webModules, 'react-dom/index.js') },
        { find: /^react-dom\/(.*)$/, replacement: path.join(webModules, 'react-dom/$1') },
        { find: /^react-native-web$/, replacement: path.join(webModules, 'react-native-web/dist/index.js') },
        { find: /^react-native-web\/(.*)$/, replacement: path.join(webModules, 'react-native-web/$1') },
        { find: '@offgrid/core', replacement: path.join(root, 'src') },
        { find: /^@atlas-host$/, replacement: path.join(here, 'src/host/index.ts') },
      ],
      dedupe: ['react', 'react-dom'],
    },
    define: {
      __DEV__: JSON.stringify(dev),
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
      'process.env.ATLAS_TARGET': JSON.stringify(desktop ? 'desktop' : 'web'),
    },
    optimizeDeps: {
      esbuildOptions: {
        resolveExtensions: ['.web.js', '.js', '.jsx', '.ts', '.tsx', '.mjs'],
        loader: { '.js': 'jsx' },
      },
      exclude: ['@wllama/wllama', '@mlc-ai/web-llm', '@huggingface/transformers'],
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      fs: { allow: [root] },
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' },
    },
    preview: {
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' },
    },
    worker: { format: 'es' },
    build: {
      outDir: desktop ? path.join(here, 'dist-desktop') : path.join(here, 'dist'),
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 4096,
      commonjsOptions: { transformMixedEsModules: true },
      rollupOptions: { input: path.join(here, 'index.html') },
    },
  };
});
