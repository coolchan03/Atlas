import RNFS from 'react-native-fs';
import { useProjectStore } from '../stores/projectStore';
import { importZipFromPath, PackResult } from './packImport';

/** Atlas library packs, built automatically on GitHub (release "atlas-library") and downloaded on demand. */
export const ATLAS_REPO = 'coolchan03/Atlas';
export const ATLAS_LIBRARY_PROJECT = 'Atlas - Library';

export interface AtlasPack { name: string; label: string; size: number; url: string; updated: string }

const LABELS: Record<string, string> = {
  '01_Medical': 'Medicine: doctor guides, surgery, drugs, mental health',
  '02_Water_Sanitation': 'Water and sanitation',
  '03_Food_Agriculture': 'Food, farming, foraging, hunting, preserving',
  '04_Engineering_Repair': 'Power, electricity, engineering, repair',
  '05_Science_Measurement': 'Science, math, measurement',
  '06_Survival_Navigation': 'Survival, navigation, weather',
  '07_Civilization_Crafts': 'Rebuilding: metals, chemistry, tools, textiles',
  '08_General_Reference': 'Languages and general reference',
  '09_Visual_Atlases': 'Plants, medical signs, anatomy guides',
  '90_Human_Read_Only': 'Historical craft and trade manuals',
};

export async function listAtlasPacks(): Promise<AtlasPack[]> {
  const r = await fetch(`https://api.github.com/repos/${ATLAS_REPO}/releases/tags/atlas-library`, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`GitHub: HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.assets || [])
    .filter((a: any) => /\.zip$/i.test(a.name))
    .map((a: any) => {
      const key = a.name.replace(/\.zip$/i, '');
      return { name: a.name, label: LABELS[key] || key.replace(/_/g, ' '), size: a.size, url: a.browser_download_url, updated: a.updated_at };
    })
    .sort((a: AtlasPack, b: AtlasPack) => a.name.localeCompare(b.name));
}

export function atlasLibraryProjectId(): string {
  const ps = useProjectStore.getState();
  let p = ps.projects.find((x) => x.name === ATLAS_LIBRARY_PROJECT);
  if (!p) {
    p = ps.createProject({ name: ATLAS_LIBRARY_PROJECT, description: 'Atlas books, converted to text. Add packs from Settings > Offline Library.', systemPrompt: '', icon: '#3F6212' } as any);
  }
  return p.id;
}

/** Download a pack and add every book part to the "Atlas - Library" project. */
export async function installAtlasPack(pack: AtlasPack, onProgress: (msg: string, frac?: number) => void): Promise<PackResult> {
  const tmp = `${RNFS.CachesDirectoryPath}/${pack.name}`;
  const { promise } = RNFS.downloadFile({
    fromUrl: pack.url,
    toFile: tmp,
    progressInterval: 1000,
    progress: (p: any) => onProgress(`Downloading ${Math.round((p.bytesWritten / Math.max(1, p.contentLength)) * 100)}%`, p.bytesWritten / Math.max(1, p.contentLength)),
  } as any);
  const res = await promise;
  if (res.statusCode && res.statusCode >= 400) throw new Error(`Download failed (HTTP ${res.statusCode})`);
  try {
    return await importZipFromPath(atlasLibraryProjectId(), tmp, pack.name, (m) => onProgress(m));
  } finally {
    RNFS.unlink(tmp).catch(() => undefined);
  }
}
