import RNFS from 'react-native-fs';
import { create } from 'zustand';
import { addLibraryFile, removeLibraryFile, useOfflineLibrary } from './offlineLibrary';

/**
 * Optional add-ons: Kiwix offline encyclopedias downloaded inside the app.
 * Nothing here is built in - each pack is downloaded only if you choose it.
 * Files go to the app's own storage folder (removed if the app is uninstalled).
 */
export interface Addon { id: string; name: string; what: string; dir: string; prefix: string; approx: string }

export const ADDONS: Addon[] = [
  { id: 'wikimed', name: 'WikiMed (medical Wikipedia)', what: 'Diseases, drugs, anatomy, first aid - with pictures', dir: 'wikipedia', prefix: 'wikipedia_en_medicine_maxi_', approx: '~2 GB' },
  { id: 'wikem', name: 'WikEM emergency medicine', what: 'Emergency doctor reference', dir: 'other', prefix: 'wikem_en_all_maxi_', approx: '~40 MB' },
  { id: 'postdisaster', name: 'Post-disaster survival', what: 'Survival and disaster collection', dir: 'other', prefix: 'zimgit-post-disaster_en_', approx: '~600 MB' },
  { id: 'medicine-zg', name: 'Medicine collection', what: 'Medical manuals collection', dir: 'other', prefix: 'zimgit-medicine_en_', approx: '~70 MB' },
  { id: 'water', name: 'Water collection', what: 'Water treatment and sanitation', dir: 'other', prefix: 'zimgit-water_en_', approx: '~20 MB' },
  { id: 'food', name: 'Food preparation', what: 'Food, cooking and preservation', dir: 'other', prefix: 'zimgit-food-preparation_en_', approx: '~100 MB' },
  { id: 'knots', name: 'Knots', what: 'How to tie knots', dir: 'other', prefix: 'zimgit-knots_en_', approx: '~30 MB' },
  { id: 'appropedia', name: 'Appropedia', what: 'Appropriate technology: build, grow, power', dir: 'other', prefix: 'appropedia_en_all_maxi_', approx: '~1 GB' },
  { id: 'energypedia', name: 'Energypedia', what: 'Small-scale solar, hydro, wind, stoves', dir: 'other', prefix: 'energypedia_en_all_maxi_', approx: '~800 MB' },
  { id: 'ifixit', name: 'iFixit repair guides', what: 'Fix phones, electronics, everything', dir: 'ifixit', prefix: 'ifixit_en_all_', approx: '~3 GB' },
  { id: 'wikivoyage', name: 'Wikivoyage', what: 'Travel guide for every country and city', dir: 'wikivoyage', prefix: 'wikivoyage_en_all_maxi_', approx: '~1 GB' },
  { id: 'wikihow', name: 'wikiHow', what: 'How-to articles on everything', dir: 'wikihow', prefix: 'wikihow_en_maxi_', approx: '~10 GB' },
  { id: 'wikipedia-mini', name: 'Wikipedia (intro of every article)', what: 'All of English Wikipedia, first paragraph only', dir: 'wikipedia', prefix: 'wikipedia_en_all_mini_', approx: '~12 GB' },
  { id: 'wikipedia-nopic', name: 'Wikipedia (full, no pictures)', what: 'All of English Wikipedia, full text', dir: 'wikipedia', prefix: 'wikipedia_en_all_nopic_', approx: '~50 GB' },
];

const BASE = 'https://download.kiwix.org/zim/';
export const addonDir = () => `${RNFS.ExternalDirectoryPath}/zim`;

interface DlState {
  progress: Record<string, number>; // 0..1
  jobs: Record<string, number>;     // RNFS job ids
  resolved: Record<string, { file: string; size: string }>;
  set: (fn: (s: DlState) => Partial<DlState>) => void;
}
export const useAddonDownloads = create<DlState>((set) => ({ progress: {}, jobs: {}, resolved: {}, set: (fn) => set(fn) }));

const listingCache: Record<string, string> = {};

/** Finds the newest file for an add-on on the Kiwix server, with its size. */
export async function resolveAddon(a: Addon): Promise<{ file: string; size: string }> {
  if (!listingCache[a.dir]) {
    const r = await fetch(`${BASE}${a.dir}/`);
    if (!r.ok) throw new Error(`Kiwix server: HTTP ${r.status}`);
    listingCache[a.dir] = await r.text();
  }
  const html = listingCache[a.dir];
  const re = new RegExp(`href="(${a.prefix.replace(/[-.]/g, '\\$&')}\\d{4}-\\d{2}\\.zim)"[^\\n]*?(\\d+(?:\\.\\d+)?[KMG])?\\s*$`, 'gm');
  const found: { file: string; size: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) found.push({ file: m[1], size: m[2] || '' });
  if (!found.length) {
    const simple = [...html.matchAll(new RegExp(`href="(${a.prefix.replace(/[-.]/g, '\\$&')}\\d{4}-\\d{2}\\.zim)"`, 'g'))].map((x) => ({ file: x[1], size: '' }));
    found.push(...simple);
  }
  if (!found.length) throw new Error('Not found on the Kiwix server right now.');
  found.sort((x, y) => (x.file < y.file ? -1 : 1));
  const best = found[found.length - 1];
  useAddonDownloads.getState().set((s) => ({ resolved: { ...s.resolved, [a.id]: best } }));
  return best;
}

export async function installedAddonPath(a: Addon): Promise<string | null> {
  const dir = addonDir();
  if (!(await RNFS.exists(dir))) return null;
  const files = await RNFS.readDir(dir);
  const f = files.find((x: any) => x.name.startsWith(a.prefix) && x.name.endsWith('.zim'));
  return f ? f.path : null;
}

export async function downloadAddon(a: Addon): Promise<void> {
  const { file } = await resolveAddon(a);
  await RNFS.mkdir(addonDir());
  const target = `${addonDir()}/${file}`;
  const part = `${target}.part`;
  const st = useAddonDownloads.getState();
  const { jobId, promise } = RNFS.downloadFile({
    fromUrl: `${BASE}${a.dir}/${file}`,
    toFile: part,
    background: true,
    discretionary: false,
    progressInterval: 1000,
    progress: (p: any) => {
      const frac = p.contentLength > 0 ? p.bytesWritten / p.contentLength : 0;
      useAddonDownloads.getState().set((s) => ({ progress: { ...s.progress, [a.id]: frac } }));
    },
  } as any);
  st.set((s) => ({ jobs: { ...s.jobs, [a.id]: jobId }, progress: { ...s.progress, [a.id]: 0 } }));
  try {
    const res = await promise;
    if (res.statusCode && res.statusCode >= 400) throw new Error(`Download failed (HTTP ${res.statusCode})`);
    // Remove an older version of the same add-on, then put the new file in place.
    const old = await installedAddonPath(a);
    if (old) { await removeLibraryFile(old); await RNFS.unlink(old).catch(() => undefined); }
    await RNFS.moveFile(part, target);
    await addLibraryFile(target);
  } finally {
    useAddonDownloads.getState().set((s) => {
      const jobs = { ...s.jobs }; delete jobs[a.id];
      const progress = { ...s.progress }; delete progress[a.id];
      return { jobs, progress };
    });
  }
}

export function cancelAddon(a: Addon): void {
  const id = useAddonDownloads.getState().jobs[a.id];
  if (id !== undefined) RNFS.stopDownload(id);
}

export async function deleteAddon(a: Addon): Promise<void> {
  const p = await installedAddonPath(a);
  if (!p) return;
  await removeLibraryFile(p);
  await RNFS.unlink(p).catch(() => undefined);
  useOfflineLibrary.getState().remove(p);
}
