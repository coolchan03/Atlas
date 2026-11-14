/**
 * Getting a map you found yourself onto the phone. Mapsforge maps are published as plain .map files (Mapsforge's own downloads) or
 * as .zip files that hold one (OpenAndroMaps, Freizeitkarte). A .zip is unpacked with the shared safe unzip, and each .map inside is
 * moved into Atlas's maps folder so it appears in the list like a downloaded map.
 */
import RNFS from 'react-native-fs';
import { safeUnzip } from '../utils/safeExtract';
import { mapsDir } from './maps';

/** Places that publish free Mapsforge maps, with what each gives you. */
export const MAP_SOURCES: Array<{ name: string; url: string; note: string }> = [
  { name: 'Mapsforge', url: 'https://download.mapsforge.org/maps/v5/', note: 'Whole countries and US states as plain .map files. You can also download these inside Atlas.' },
  { name: 'OpenAndroMaps', url: 'https://www.openandromaps.org/en/downloads', note: 'Many regions with hiking and cycling detail. Each comes as a .zip with a .map inside: open the .zip in Atlas.' },
  { name: 'Freizeitkarte', url: 'https://www.freizeitkarte-osm.de/android/en/', note: 'Country maps for outdoor use, as .zip files with a .map inside.' },
];

async function findMaps(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 4) return;
  for (const item of await RNFS.readDir(dir)) {
    if (item.isDirectory()) await findMaps(item.path, out, depth + 1);
    else if (/\.map$/i.test(item.name)) out.push(item.path);
  }
}

/** Unpacks a .zip of maps into the maps folder. Resolves the new files' paths, or throws a readable message. */
export async function importMapZip(zipPath: string): Promise<string[]> {
  const scratch = `${RNFS.CachesDirectoryPath}/map-import-${Date.now()}`;
  try {
    await RNFS.mkdir(scratch);
    await safeUnzip(zipPath, scratch);
    const found: string[] = [];
    await findMaps(scratch, found);
    if (!found.length) throw new Error('There is no .map file inside that zip.');
    const dest = mapsDir();
    await RNFS.mkdir(dest);
    const placed: string[] = [];
    for (const from of found) {
      const name = from.split('/').pop() as string;
      const to = `${dest}/${name}`;
      if (await RNFS.exists(to)) await RNFS.unlink(to);
      await RNFS.moveFile(from, to);
      placed.push(to);
    }
    return placed;
  } finally {
    await RNFS.unlink(scratch).catch(() => undefined);
  }
}
