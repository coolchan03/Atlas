import { NativeModules } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Atlas offline library: Kiwix .zim files the user added (Wikipedia, WikiMed, iFixit, Wikivoyage...). */
const Native: any = NativeModules.AtlasKiwix;
export const libraryAvailable = (): boolean => !!Native;

export interface LibraryFile { uri: string; title: string; language?: string; description?: string; articles: number; bytes: number; fulltext: boolean; enabled: boolean }
export interface LibraryHit { uri: string; library: string; path: string; title: string; snippet: string }

interface LibState {
  files: LibraryFile[];
  upsert: (f: LibraryFile) => void;
  remove: (uri: string) => void;
  toggle: (uri: string) => void;
}

export const useOfflineLibrary = create<LibState>()(
  persist(
    (set) => ({
      files: [],
      upsert: (f) => set((s) => ({ files: [...s.files.filter((x) => x.uri !== f.uri), f] })),
      remove: (uri) => set((s) => ({ files: s.files.filter((x) => x.uri !== uri) })),
      toggle: (uri) => set((s) => ({ files: s.files.map((x) => (x.uri === uri ? { ...x, enabled: !x.enabled } : x)) })),
    }),
    { name: 'atlas-offline-library', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export async function addLibraryFile(uri: string): Promise<LibraryFile> {
  if (!Native) throw new Error('Offline library is not available in this build.');
  const info = await Native.openFile(uri);
  const f: LibraryFile = { ...info, enabled: true };
  useOfflineLibrary.getState().upsert(f);
  return f;
}

export async function removeLibraryFile(uri: string): Promise<void> {
  useOfflineLibrary.getState().remove(uri);
  if (Native) await Native.close(uri).catch(() => undefined);
}

export async function searchLibrary(query: string, limit = 5): Promise<LibraryHit[]> {
  if (!Native) return [];
  const uris = useOfflineLibrary.getState().files.filter((f) => f.enabled).map((f) => f.uri);
  if (!uris.length) return [];
  return Native.search(uris, query, limit);
}

export async function readArticle(uri: string, path: string, maxChars = 4000): Promise<{ title: string; text: string }> {
  if (!Native) throw new Error('Offline library is not available.');
  return Native.getArticle(uri, path, maxChars);
}

/** Text for the AI: top matches with the opening of the best articles. */
export async function libraryToolAnswer(query: string): Promise<string> {
  const files = useOfflineLibrary.getState().files.filter((f) => f.enabled);
  if (!files.length) return 'No offline library files are added. (Settings > Offline library)';
  const hits = await searchLibrary(query, 4);
  if (!hits.length) return `Nothing found in the offline library for "${query}".`;
  const parts: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (i < 2) {
      try {
        const a = await readArticle(h.uri, h.path, 1800);
        parts.push(`[${h.library}: ${a.title}]\n${a.text}`);
        continue;
      } catch { /* fall through to the snippet */ }
    }
    parts.push(`[${h.library}: ${h.title}] ${h.snippet}`);
  }
  return parts.join('\n\n---\n\n');
}
