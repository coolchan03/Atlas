/** Adding a SoundFont: a wrong or damaged file changes nothing, the new one replaces the old only when it is all there, and a download that is not the expected file is refused. Only the file system is faked. */
import { buildSf2 } from '../../helpers/buildSf2';

const mockFiles = new Map<string, Uint8Array>();
let mockCopyFails = false;
let mockDownloaded: Uint8Array = new Uint8Array();
let mockStatus = 200;
const mockB64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
jest.mock('react-native-fs', () => ({ __esModule: true, default: {
  DocumentDirectoryPath: '/doc',
  mkdir: jest.fn(async () => undefined),
  exists: jest.fn(async (p: string) => mockFiles.has(p)),
  unlink: jest.fn(async (p: string) => { mockFiles.delete(p); }),
  stat: jest.fn(async (p: string) => { if (!mockFiles.has(p)) throw new Error('no file'); return { size: mockFiles.get(p)!.length }; }),
  read: jest.fn(async (p: string, len: number, pos: number) => mockB64(mockFiles.get(p)!.slice(pos, pos + len))),
  copyFile: jest.fn(async (from: string, to: string) => { if (mockCopyFails) { mockFiles.set(to, new Uint8Array(3)); throw new Error('disk full'); } mockFiles.set(to, mockFiles.get(from)!); }),
  moveFile: jest.fn(async (from: string, to: string) => { mockFiles.set(to, mockFiles.get(from)!); mockFiles.delete(from); }),
  downloadFile: jest.fn(({ toFile }: { toFile: string }) => ({ promise: (async () => { mockFiles.set(toFile, mockDownloaded); return { statusCode: mockStatus }; })() })),
}}));

const load = () => {
  jest.resetModules();
  const files = require('../../../src/music/soundfontFiles');
  const { useMusicLibrary } = require('../../../src/music/library');
  useMusicLibrary.setState({ soundfont: null, useSoundfont: true });
  return { ...files, lib: useMusicLibrary };
};
beforeEach(() => { mockFiles.clear(); mockCopyFails = false; mockStatus = 200; mockDownloaded = new Uint8Array(); });

it('keeps a real SoundFont, and refuses a file that is not one without changing anything', async () => {
  const t = load();
  mockFiles.set('/picked/real.sf2', buildSf2());
  mockFiles.set('/picked/notes.txt', new TextEncoder().encode('just some text, not a soundfont at all'));
  await t.installSoundfontFrom('/picked/real.sf2', 'real.sf2');
  expect(t.lib.getState().soundfont).toMatchObject({ name: 'real', path: '/doc/soundfonts/active.sf2' });
  await expect(t.installSoundfontFrom('/picked/notes.txt', 'notes.txt')).rejects.toThrow(/not a SoundFont/);
  expect(t.lib.getState().soundfont?.name).toBe('real');
  expect(mockFiles.has('/doc/soundfonts/active.sf2')).toBe(true);
  expect((await t.prepareInstruments()).real).toBe(true);
});

it('leaves the working SoundFont in place when copying a new one fails part-way', async () => {
  const t = load();
  mockFiles.set('/picked/a.sf2', buildSf2());
  await t.installSoundfontFrom('/picked/a.sf2', 'a.sf2');
  const before = mockFiles.get('/doc/soundfonts/active.sf2');
  mockFiles.set('/picked/b.sf2', buildSf2());
  mockCopyFails = true;
  await expect(t.installSoundfontFrom('/picked/b.sf2', 'b.sf2')).rejects.toThrow(/disk full/);
  expect(mockFiles.get('/doc/soundfonts/active.sf2')).toBe(before);
  expect(t.lib.getState().soundfont?.name).toBe('a');
  expect(mockFiles.has('/doc/soundfonts/incoming.sf2')).toBe(false); // no half-copied file is left behind
});

it('refuses a download that is not the expected size, and installs one that is', async () => {
  const t = load();
  mockDownloaded = buildSf2(); // a few kilobytes: not the 6 MB set
  await expect(t.downloadFreeSoundfont()).rejects.toThrow(/not the instruments that were expected/);
  expect(t.lib.getState().soundfont).toBeNull();
  expect(mockFiles.has('/doc/soundfonts/download.sf2')).toBe(false);
  const big = new Uint8Array(5_500_000); big.set(buildSf2());
  mockDownloaded = big;
  await t.downloadFreeSoundfont();
  expect(t.lib.getState().soundfont).toMatchObject({ name: 'TimGM6mb', bytes: 5_500_000 });
  mockStatus = 404;
  await expect(t.downloadFreeSoundfont()).rejects.toThrow(/404/);
});
