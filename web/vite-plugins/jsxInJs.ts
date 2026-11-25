// A few React Native packages ship JSX inside .js files (Metro's babel handles that; esbuild does not by default).
import type { Plugin } from 'vite';
import { transformWithEsbuild } from 'vite';

const PACKAGES = ['@ronradtke/react-native-markdown-display', 'react-native-spotlight-tour', 'react-native-vector-icons'];

export function jsxInJs(): Plugin {
  return {
    name: 'atlas-jsx-in-js',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.js') || !file.includes('node_modules')) return null;
      if (!PACKAGES.some((p) => file.includes(`node_modules/${p}/`))) return null;
      const r = await transformWithEsbuild(code, file, { loader: 'jsx', jsx: 'automatic' });
      return { code: r.code, map: r.map };
    },
  };
}
