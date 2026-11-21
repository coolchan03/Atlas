import { installNativeBoundary } from '../harness/nativeBoundary';

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('safeUnzip', () => {
  it('unpacks a normal zip and keeps the files', async () => {
    installNativeBoundary({ fs: true });
    const RNFS = require('react-native-fs');
    await RNFS.mkdir('/in'); await RNFS.writeFile('/in/ok.zip', JSON.stringify({ files: { 'a/b.txt': b64('hello world '.repeat(20)) } }), 'utf8');
    const { safeUnzip } = require('../../src/utils/safeExtract');
    await safeUnzip('/in/ok.zip', '/out');
    expect(await RNFS.exists('/out/a/b.txt')).toBe(true);
  });
  it('removes the folder and says why when the zip holds an unsafe name or too much', async () => {
    installNativeBoundary({ fs: true });
    const RNFS = require('react-native-fs');
    await RNFS.mkdir('/in');
    // a name with encoded separators passes through the fake unzip as a plain name, which the check refuses
    await RNFS.writeFile('/in/bad.zip', JSON.stringify({ files: { 'x%2e%2e%2fy.txt': b64('data') } }), 'utf8');
    const { safeUnzip } = require('../../src/utils/safeExtract');
    await expect(safeUnzip('/in/bad.zip', '/out2')).rejects.toThrow(/was not used.*leave the folder/);
    expect(await RNFS.exists('/out2')).toBe(false);
  });
});
