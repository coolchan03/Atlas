/** Importing a map zip: the .map inside is moved into the maps folder; a zip without one is refused. */
import { installNativeBoundary } from '../../harness/nativeBoundary';

function load() {
  jest.resetModules();
  const boundary = installNativeBoundary({ fs: true });
  const RNFS = require('react-native-fs');
  const mod = require('../../../src/atlasMaps/importMap');
  return { mod, boundary, RNFS };
}
const archive = (files: Record<string, string>) => Buffer.from(JSON.stringify({ zip: true, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v).toString('base64')])) })).toString('base64');

describe('map sources and zips', () => {
  it('lists places to find maps, each with a web address and a note', () => {
    const { mod } = load();
    expect(mod.MAP_SOURCES.length).toBeGreaterThanOrEqual(3);
    for (const s of mod.MAP_SOURCES) { expect(s.url).toMatch(/^https:\/\//); expect(s.note.length).toBeGreaterThan(10); }
  });

  it('moves the .map files of a zip into the maps folder, replacing an older copy', async () => {
    const { mod, RNFS } = load();
    await RNFS.writeFile('/in/maps.zip', archive({ 'Region/berlin.map': 'MAPDATA', 'Region/readme.txt': 'hi' }), 'base64');
    const placed = await mod.importMapZip('/in/maps.zip');
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatch(/\/maps\/berlin\.map$/);
    expect(await RNFS.exists(placed[0])).toBe(true);
    await RNFS.writeFile('/in/again.zip', archive({ 'berlin.map': 'NEWER' }), 'base64');
    const again = await mod.importMapZip('/in/again.zip');
    expect(again[0]).toBe(placed[0]);
    expect(await RNFS.readFile(placed[0], 'utf8')).toBe('NEWER');
  });

  it('refuses a zip with no .map and cleans up after itself', async () => {
    const { mod, RNFS } = load();
    await RNFS.writeFile('/in/none.zip', archive({ 'notes.txt': 'hi' }), 'base64');
    await expect(mod.importMapZip('/in/none.zip')).rejects.toThrow('no .map file');
    const left = (await RNFS.readDir(RNFS.CachesDirectoryPath)).filter((d: { name: string }) => d.name.startsWith('map-import-'));
    expect(left).toHaveLength(0);
  });
});

export {};
