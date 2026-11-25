// Piper voices in the browser (VITS ONNX) through @diffusionstudio/vits-web. Models come from the Hugging Face Hub
// once, then live in the origin private file system; the phonemiser WASM is cached by the service worker.
import { fromWav, type Chunk } from './pcmPlayer';

const MAP: Record<string, string> = {
  'piper-amy': 'en_US-amy-medium', 'piper-ryan': 'en_US-ryan-medium', 'piper-lessac': 'en_US-lessac-medium',
  'piper-joe': 'en_US-joe-medium', 'piper-hfc': 'en_US-hfc_female-medium',
};
export const piperIds = Object.keys(MAP);
export const isPiper = (id: string) => id in MAP;
const lib = () => import('@diffusionstudio/vits-web');

export async function loadPiper(id: string, onProgress?: (fraction: number) => void) {
  const { download } = await lib();
  await download(MAP[id] as any, (p) => p.total && onProgress?.(Math.min(1, p.loaded / p.total)));
  onProgress?.(1);
}
export async function synthPiper(text: string, id: string): Promise<Chunk> {
  const { predict } = await lib();
  const blob = await predict({ text, voiceId: MAP[id] as any });
  return fromWav(new Uint8Array(await blob.arrayBuffer()));
}
export async function installedPiper(): Promise<string[]> {
  try {
    const { stored } = await lib();
    const have = new Set(await stored());
    return piperIds.filter((id) => have.has(MAP[id] as any));
  } catch { return []; }
}
export async function removePiper(id: string) {
  try { await (await lib()).remove(MAP[id] as any); } catch { /* not stored */ }
}
