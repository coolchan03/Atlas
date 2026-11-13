import { installNativeBoundary } from '../harness/nativeBoundary';

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('stageZip (real unpack into a scratch folder, nothing added)', () => {
  it('lists every file with a decision, then discards the scratch folder', async () => {
    installNativeBoundary({ fs: true });
    const RNFS = require('react-native-fs');
    await RNFS.mkdir('/in');
    await RNFS.writeFile('/in/course.zip', JSON.stringify({ files: {
      'Book/ch1.pdf': b64('pdf text '.repeat(40)), 'FAR questions.csv': b64('q,a\n1,2\n'), 'x/y.bin': b64('binary'), 'notes.zip': b64('PK'),
    } }), 'utf8');
    const { stageZip, discardStage, summarizeStage } = require('../../src/learning/zipStaging');
    const staged = await stageZip('/in/course.zip', RNFS.CachesDirectoryPath);
    expect(staged.entries.map((e: any) => `${e.name}:${e.kind}`).sort()).toEqual(['Book/ch1.pdf:document', 'FAR questions.csv:questions', 'notes.zip:archive', 'x/y.bin:unsupported']);
    expect(summarizeStage(staged)).toMatch(/^4 files in the zip/);
    await discardStage(staged);
    expect(await RNFS.exists(staged.dir)).toBe(false);
  });
});
