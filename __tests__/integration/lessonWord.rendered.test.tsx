/** "Save as Word" on a lesson writes a .docx with the lesson in it and opens the share sheet for it. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('saves the lesson as a Word document and shares it', async () => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const RNFS = require('react-native-fs');
  const shared: Array<{ file?: string; title?: string }> = [];
  jest.doMock('../../src/utils/shareItem', () => ({ shareItem: async (i: { file?: string }) => { shared.push(i); return true; } }));
  const { RewriteRow } = require('../../src/topics/CitedFold');
  const lesson = { kind: 'lesson', sections: [{ heading: 'Why leases matter', text: 'A lease moves **rights** to use an asset.', example: 'Rent is $100 a month.' }], commonMistakes: [], keyPoints: ['Rights, not ownership'] };
  const view = rtl.render(React.createElement(RewriteRow, { show: true, onPick: jest.fn(), content: lesson, title: 'FAR: Leases' }));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('square-save-word')); });
  await rtl.waitFor(() => expect(shared).toHaveLength(1));
  expect(shared[0].file).toMatch(/FAR Leases\.docx$/);
  const zipped = JSON.parse(await RNFS.readFile(shared[0].file, 'utf8')) as { files: Record<string, string> };
  expect(Object.keys(zipped.files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  const doc = Buffer.from(zipped.files['word/document.xml'], 'base64').toString('utf8');
  expect(doc).toContain('Why leases matter');
  expect(doc).toContain('<w:b/>');
  expect(doc).toContain('Rent is $100 a month.');
  expect(doc).toContain('Rights, not ownership');
});
