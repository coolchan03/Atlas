jest.mock('@react-native-documents/picker', () => ({
  saveDocuments: jest.fn(),
  isErrorWithCode: (e: any) => !!e?.code,
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));
import RNFS from 'react-native-fs';
import { saveDocuments } from '@react-native-documents/picker';
import { safeFileName, saveMarkdown, studyMarkdown } from '../../../src/study/exportFiles';
import type { StudyResult } from '../../../src/study/engine';

const result: StudyResult = {
  kind: 'formulas', createdAt: 1, topic: 'motion', title: 'Formula sheet: motion',
  text: '## Speed\n`v = d / t` [2]\n\n## Force\n`F = m * a` [1]',
  sources: [{ n: 1, doc: 'physics.pdf', part: 3, text: 'x' }, { n: 2, doc: 'notes.txt', part: 1, text: 'y' }, { n: 3, doc: 'unused.txt', part: 1, text: 'z' }],
};

describe('study file export', () => {
  it('writes the text with only the sources it cites', () => {
    const md = studyMarkdown(result, 'Formula sheet: motion');
    expect(md.startsWith('# Formula sheet: motion')).toBe(true);
    expect(md).toContain('`F = m * a`');
    expect(md).toContain('- [1] physics.pdf, part 3');
    expect(md).toContain('- [2] notes.txt, part 1');
    expect(md).not.toContain('unused.txt');
  });

  it('makes a safe file name', () => {
    expect(safeFileName('Formula sheet: motion/forces?', 'md')).toBe('Formula sheet motion forces.md');
    expect(safeFileName('???', 'pptx')).toBe('Atlas study.pptx');
  });

  it('saves through the picker and removes its cache copy', async () => {
    (saveDocuments as jest.Mock).mockResolvedValueOnce([{ name: 'Sheet.md' }]);
    expect(await saveMarkdown('Sheet.md', 'hello')).toBe('Sheet.md');
    expect(RNFS.writeFile).toHaveBeenCalledWith(expect.stringContaining('Sheet.md'), 'hello', 'utf8');
    expect(RNFS.unlink).toHaveBeenCalled();
  });

  it('returns null when the picker is closed', async () => {
    (saveDocuments as jest.Mock).mockRejectedValueOnce({ code: 'OPERATION_CANCELED' });
    expect(await saveMarkdown('Sheet.md', 'hello')).toBeNull();
  });
});
