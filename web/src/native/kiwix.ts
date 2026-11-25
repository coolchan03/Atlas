// AtlasKiwix on top of the in-app ZIM reader (engines/zim/zim.ts).
import { registerNativeModule } from './registry';
import { fs, norm, baseName } from '../host/fs';
import { Zim, htmlToText, type ZimInfo } from '../engines/zim/zim';

interface Opened { zim: Zim; info: ZimInfo }
const open = new Map<string, Promise<Opened>>();

async function openZim(uri: string): Promise<Opened> {
  let p = open.get(uri);
  if (!p) {
    p = (async () => {
      const path = norm(uri);
      const st = await fs().stat(path);
      let read: (pos: number, len: number) => Promise<Uint8Array>;
      if (fs().kind === 'opfs') {
        const file = await fs().getFile(path); // a handle: slices are read lazily from disk
        read = async (pos, len) => new Uint8Array(await file.slice(pos, Math.min(st.size, pos + len)).arrayBuffer());
      } else {
        read = (pos, len) => fs().readRange(path, pos, Math.min(len, st.size - pos));
      }
      const zim = await Zim.open(read, st.size);
      return { zim, info: await zim.info(baseName(path)) };
    })();
    p.catch(() => open.delete(uri));
    open.set(uri, p);
  }
  return p;
}

registerNativeModule('AtlasKiwix', {
  async openFile(uri: string) { const o = await openZim(uri); return { uri, ...o.info }; },
  async close(uri: string) { open.delete(uri); return true; },
  async search(uris: string[], query: string, limit: number) {
    const out: unknown[] = [];
    for (const uri of uris) {
      try {
        const o = await openZim(uri);
        const words = query.trim().split(/\s+/).filter(Boolean);
        // Title search: the whole phrase, then each longer word, until there are enough hits.
        const tries = [query.trim(), ...words.filter((w) => w.length > 3)];
        const seen = new Set<string>();
        for (const t of tries) {
          for (const e of await o.zim.suggest(t, limit)) {
            if (seen.has(e.path) || out.length >= limit * uris.length) continue;
            seen.add(e.path);
            out.push({ uri, library: o.info.title, path: e.path, title: e.title, snippet: '' });
          }
          if (seen.size >= limit) break;
        }
      } catch { /* one bad file must not stop the others */ }
    }
    return out;
  },
  async getArticle(uri: string, path: string, maxChars: number) {
    const o = await openZim(uri);
    const a = await o.zim.article(path);
    if (!a) throw new Error('Article not found');
    return { title: a.title, text: htmlToText(a.html, maxChars) };
  },
});
