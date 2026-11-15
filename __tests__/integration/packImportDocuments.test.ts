/**
 * Importing a zip of study material into a project from the Knowledge screen: PDFs and Word files are added as well as text files,
 * and files Atlas cannot read are reported instead of being skipped without a word. Only the document indexer is faked.
 */
import { installNativeBoundary } from '../harness/nativeBoundary';

const mockIndexed: string[] = [];
jest.mock('../../src/services/rag', () => ({
  ragService: { indexDocument: jest.fn(async ({ fileName }: { fileName: string }) => { mockIndexed.push(fileName); return 1; }) },
}));

const b64 = (s: string) => Buffer.from(s).toString('base64');

it('adds the PDFs, Word files, pages and text in a study pack, and lists the files it could not read', async () => {
  installNativeBoundary({ fs: true });
  const RNFS = require('react-native-fs');
  await RNFS.mkdir('/in');
  await RNFS.writeFile('/in/FAR_Study_Pack.zip', JSON.stringify({ files: {
    'FAR_Study_Pack/FAR_100_Practice_Questions.pdf': b64('questions '.repeat(40)),
    'FAR_Study_Pack/FAR_100_Practice_Questions.docx': b64('questions '.repeat(40)),
    'FAR_Study_Pack/FAR_Study_Notes.docx': b64('notes '.repeat(40)),
    'FAR_Study_Pack/FAR_OFFLINE_PRACTICE.html': b64('<p>practice</p>'),
    'FAR_Study_Pack/START_HERE.txt': b64('start here'),
    'FAR_Study_Pack/FAR_Question_Bank.csv': b64('q,a\n1,2\n'),
    'FAR_Study_Pack/lecture1.mp4': b64('video'),
    'FAR_Study_Pack/cover.png': b64('picture'),
  } }), 'utf8');
  const { importZipFromPath } = require('../../src/atlasTools/packImport');
  const result = await importZipFromPath('p1', { path: '/in/FAR_Study_Pack.zip', name: 'FAR_Study_Pack.zip' }, { onProgress: () => undefined });
  expect(mockIndexed.sort()).toEqual(['FAR_100_Practice_Questions.docx', 'FAR_100_Practice_Questions.pdf', 'FAR_OFFLINE_PRACTICE.html', 'FAR_Question_Bank.csv', 'FAR_Study_Notes.docx', 'START_HERE.txt']);
  expect(result).toMatchObject({ added: 6, skipped: 0, failed: [], total: 6 });
  expect(result.ignored.sort()).toEqual(['cover.png', 'lecture1.mp4']);
});
