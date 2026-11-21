import { fromBase64, parseCentralDirectory, parseEndRecord, readZipDirectory } from '../../../src/learning/zipDirectory';
import { directoryProblems, stageZip, MAX_ENTRIES } from '../../../src/learning/zipStaging';

jest.mock('react-native-fs', () => ({ __esModule: true, default: { read: jest.fn(), stat: jest.fn(), mkdir: jest.fn(), unlink: jest.fn(() => Promise.resolve()), readDir: jest.fn(), CachesDirectoryPath: '/cache' } }));
jest.mock('react-native-zip-archive', () => ({ unzip: jest.fn() }));

const le = (n: number, bytes: number) => Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 0xff);
/** A central directory (and end record) for the given entries; the file data itself is not needed to read the list. */
function buildZip(entries: Array<{ name: string; size: number; compressed?: number }>, opts: { zip64?: boolean } = {}) {
  const cd: number[] = [];
  for (const e of entries) {
    const name = Array.from(Buffer.from(e.name));
    cd.push(...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4),
      ...le(e.compressed ?? 1, 4), ...le(e.size, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(0, 4), ...name);
  }
  const eocd = [...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(opts.zip64 ? 0xffff : entries.length, 2), ...le(opts.zip64 ? 0xffff : entries.length, 2), ...le(cd.length, 4), ...le(0, 4), ...le(0, 2)];
  return Buffer.from([...cd, ...eocd]);
}

describe('reading a zip\'s list of files without unpacking', () => {
  it('lists names and unpacked sizes', () => {
    const zip = buildZip([{ name: 'Book/ch1.pdf', size: 5000, compressed: 900 }, { name: 'notes.md', size: 20 }]);
    const end = parseEndRecord(new Uint8Array(zip));
    expect(end).toMatchObject({ entries: 2, offset: 0 });
    expect(parseCentralDirectory(new Uint8Array(zip.subarray(end.offset, end.offset + end.size)), end.entries)).toEqual([
      { name: 'Book/ch1.pdf', compressed: 900, size: 5000 }, { name: 'notes.md', compressed: 1, size: 20 },
    ]);
  });
  it('refuses non-zips, zip64 and damaged directories', () => {
    expect(() => parseEndRecord(new Uint8Array(Buffer.from('not a zip at all, just text')))).toThrow(/not a readable zip/);
    expect(() => parseEndRecord(new Uint8Array(buildZip([{ name: 'a', size: 1 }], { zip64: true })))).toThrow(/zip64/);
    expect(() => parseCentralDirectory(new Uint8Array(4), 1)).toThrow(/damaged/);
  });
  it('decodes base64 including padding', () => {
    expect(Buffer.from(fromBase64('aGVsbG8=')).toString()).toBe('hello');
    expect(Buffer.from(fromBase64('aGk=')).toString()).toBe('hi');
    expect(Buffer.from(fromBase64('YWJj')).toString()).toBe('abc');
  });
});

describe('limits are applied before any file is unpacked', () => {
  it('flags too many files, a huge unpacked size, a bomb ratio and paths leaving the folder', () => {
    expect(directoryProblems(1000, [{ name: 'a.pdf', size: 10 }])).toEqual([]);
    expect(directoryProblems(1000, Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({ name: `${i}.txt`, size: 1 }))).join(' ')).toMatch(/more than/);
    expect(directoryProblems(1000, [{ name: 'big.bin', size: 4 * 1024 ** 3 }]).join(' ')).toMatch(/3 GB/);
    expect(directoryProblems(1000, [{ name: 'bomb.txt', size: 500_000 }]).join(' ')).toMatch(/compressed far more/);
    expect(directoryProblems(1000, [{ name: '../../evil.sh', size: 10 }]).join(' ')).toMatch(/leave the folder/);
    expect(directoryProblems(1000, [{ name: 'Book/', size: 0 }, { name: 'Book/a.pdf', size: 10 }])).toEqual([]);
  });

  it('refuses a bomb without creating a scratch folder or calling unzip', async () => {
    const RNFS = require('react-native-fs').default;
    const { unzip } = require('react-native-zip-archive');
    RNFS.stat.mockResolvedValue({ size: 1000 });
    const zip = buildZip([{ name: 'bomb.txt', size: 900_000_000, compressed: 500 }]);
    RNFS.read.mockImplementation(async (_p: string, length: number, position: number) => zip.subarray(position, position + length).toString('base64'));
    await expect(stageZip('/z.zip', '/cache')).rejects.toThrow(/not opened/);
    expect(RNFS.mkdir).not.toHaveBeenCalled();
    expect(unzip).not.toHaveBeenCalled();
  });

  it('reads the directory through file reads of only the end and the directory', async () => {
    const RNFS = require('react-native-fs').default;
    const zip = buildZip([{ name: 'a.pdf', size: 10 }]);
    RNFS.read.mockImplementation(async (_p: string, length: number, position: number) => zip.subarray(position, position + length).toString('base64'));
    await expect(readZipDirectory('/z.zip', zip.length, 100)).resolves.toEqual([{ name: 'a.pdf', compressed: 1, size: 10 }]);
    await expect(readZipDirectory('/z.zip', zip.length, 0)).rejects.toThrow(/more than/);
  });
});
