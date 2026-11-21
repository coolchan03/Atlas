import { addFilesToProject, uniqueName } from '../../../src/learning/documents';
import { ragService } from '../../../src/services/rag';

const RNFS = require('react-native-fs');

describe('UX-08 same file name, different content', () => {
  beforeEach(() => {
    jest.spyOn(ragService, 'getDocumentsByProject').mockResolvedValue([{ id: 'd1', name: 'chapter1.pdf', path: '/stored/chapter1.pdf' }] as never);
  });
  const hashes: Record<string, string> = { '/stored/chapter1.pdf': 'aaa', '/new/same.pdf': 'aaa', '/new/other-book.pdf': 'bbb' };
  beforeEach(() => { RNFS.hash.mockImplementation(async (p: string) => hashes[p] ?? 'zzz'); });

  it('skips a true duplicate (same bytes)', async () => {
    const indexed: string[] = [];
    const r = await addFilesToProject({ projectId: 'p', files: [{ path: '/new/same.pdf', name: 'chapter1.pdf', size: 5 }], index: async (x) => { indexed.push(x.fileName); } });
    expect(r.skipped).toEqual(['chapter1.pdf']); expect(indexed).toEqual([]);
  });
  it('keeps a different book with the same file name under its own name instead of dropping it', async () => {
    const indexed: string[] = [];
    const r = await addFilesToProject({ projectId: 'p', files: [{ path: '/new/other-book.pdf', name: 'chapter1.pdf', size: 5 }], index: async (x) => { indexed.push(x.fileName); } });
    expect(r.added).toEqual(['chapter1 (2).pdf']); expect(indexed).toEqual(['chapter1 (2).pdf']); expect(r.skipped).toEqual([]);
  });
  it('picks the next free name', () => {
    expect(uniqueName('a.pdf', new Set(['a.pdf', 'a (2).pdf']))).toBe('a (3).pdf');
    expect(uniqueName('noext', new Set(['noext']))).toBe('noext (2)');
  });
});
