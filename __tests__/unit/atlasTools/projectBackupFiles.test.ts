import RNFS from 'react-native-fs';
import { collectProjectFiles, restoreProjectFiles } from '../../../src/atlasTools/projectBackupFiles';

const mockFiles = new Map<string, string>();
const mockDirs = new Set<string>(['/docs', '/docs/attachments']);
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    exists: jest.fn(async (path: string) => mockFiles.has(path) || mockDirs.has(path)),
    mkdir: jest.fn(async (path: string) => { mockDirs.add(path); }),
    stat: jest.fn(async (path: string) => {
      if (!mockFiles.has(path)) throw new Error('Missing file');
      return { size: Buffer.from(mockFiles.get(path)!, 'base64').length };
    }),
    readFile: jest.fn(async (path: string) => {
      if (!mockFiles.has(path)) throw new Error('Missing file');
      return mockFiles.get(path);
    }),
    writeFile: jest.fn(async (path: string, data: string) => { mockFiles.set(path, data); }),
    unlink: jest.fn(async (path: string) => { mockFiles.delete(path); }),
    readDir: jest.fn(async (path: string) =>
      Array.from(mockFiles.keys()).filter(k => k.startsWith(`${path  }/`))
        .map(k => ({ name: k.split('/').pop(), path: k, isFile: () => true }))),
  },
}));
const mockGetDocs = jest.fn(async (_id: string): Promise<any[]> => []);
const mockGetChunks = jest.fn(async (_id: number): Promise<any[]> => []);
const mockRestore = jest.fn(async (_ids: string[], _docs: any[]) => undefined);
jest.mock('../../../src/services/rag', () => ({
  ragService: {
    getDocumentsByProject: (...a: any[]) => mockGetDocs(...a as [string]),
    getDocumentChunks: (...a: any[]) => mockGetChunks(...a as [number]),
    restoreProjectDocuments: (...a: any[]) => mockRestore(...a as [string[], any[]]),
  },
}));
const sample = (name = 'context.pdf', projectId = 'therapy') => ({
  projectId, name, size: 3, enabled: false, createdAt: '2026-01-01T00:00:00.000Z',
  base64: 'YWJj', chunks: [{ content: 'About the project', position: 0 }],
});
describe('portable project knowledge-base backups', () => {
  beforeEach(() => {
    mockFiles.clear(); mockDirs.clear(); mockDirs.add('/docs'); mockDirs.add('/docs/attachments');
    jest.clearAllMocks();
    mockGetDocs.mockResolvedValue([]);
    mockGetChunks.mockResolvedValue([]);
    mockRestore.mockResolvedValue(undefined);
  });
  it('exports the actual original bytes and per-project searchable chunks', async () => {
    mockFiles.set('/docs/attachments/40_context.pdf', 'YWJj');
    mockGetDocs.mockResolvedValueOnce([{ id: 40, name: 'context.pdf', path: '/gone/picker.pdf',
      size: 3, enabled: 0, created_at: '2026-01-01T00:00:00.000Z' }]);
    mockGetChunks.mockResolvedValueOnce([{ id: 1, content: 'About the project', position: 0 }]);
    const result = await collectProjectFiles(['therapy']);
    expect(result).toEqual([sample()]);
    expect(RNFS.readFile).toHaveBeenCalledWith('/docs/attachments/40_context.pdf', 'base64');
  });
  it('restores a file into its original project with searchable chunks and enabled state', async () => {
    await expect(restoreProjectFiles([sample(), sample('study.md', 'mba')], ['therapy', 'mba']))
      .resolves.toBe(2);
    expect(mockRestore).toHaveBeenCalledWith(['therapy', 'mba'], [
      expect.objectContaining({ projectId: 'therapy', name: 'context.pdf', enabled: false,
        chunks: [{ content: 'About the project', position: 0 }],
        path: expect.stringMatching(/^\/docs\/atlas-project-files\/therapy\//) }),
      expect.objectContaining({ projectId: 'mba', name: 'study.md',
        path: expect.stringMatching(/^\/docs\/atlas-project-files\/mba\//) }),
    ]);
    const paths = Array.from(mockFiles.keys());
    expect(paths).toHaveLength(2);
    expect(paths.every(p => mockFiles.get(p) === 'YWJj')).toBe(true);
  });
  it.each(['../escape.md', 'path/file.md', 'a\\b.txt', 'file:bad.pdf'])(
    'rejects unsafe restored document name %s before writing', async name => {
      await expect(restoreProjectFiles([sample(name)], ['therapy'])).rejects.toThrow(/Invalid project document/);
      expect(RNFS.writeFile).not.toHaveBeenCalled();
      expect(mockRestore).not.toHaveBeenCalled();
    });
  it('refuses orphaned project files, corrupt bytes, duplicate documents and excessive data', async () => {
    await expect(restoreProjectFiles([sample()], ['unrelated'])).rejects.toThrow();
    await expect(restoreProjectFiles([{ ...sample(), base64: 'abc' }], ['therapy'])).rejects.toThrow();
    await expect(restoreProjectFiles([sample(), sample()], ['therapy'])).rejects.toThrow(/Duplicate/);
    await expect(restoreProjectFiles([{ ...sample(), size: 26 * 1024 * 1024 }], ['therapy'])).rejects.toThrow();
    expect(mockRestore).not.toHaveBeenCalled();
    expect(RNFS.writeFile).not.toHaveBeenCalled();
  });
  it('rolls back staged file writes if updating the project index fails', async () => {
    mockRestore.mockRejectedValueOnce(new Error('SQLite disk full'));
    await expect(restoreProjectFiles([sample()], ['therapy'])).rejects.toThrow('SQLite disk full');
    expect(mockFiles.size).toBe(0);
    expect(mockRestore).toHaveBeenCalledTimes(1);
  });
  it('fails export rather than producing an incomplete archive when a file is missing', async () => {
    mockGetDocs.mockResolvedValueOnce([{ id: 1, name: 'missing.pdf', path: '/gone/missing.pdf' }]);
    await expect(collectProjectFiles(['therapy'])).rejects.toThrow(/missing/);
  });
  it('supports a project that has no documents and clears the restored index', async () => {
    await expect(restoreProjectFiles([], ['therapy'])).resolves.toBe(0);
    expect(mockRestore).toHaveBeenCalledWith(['therapy'], []);
  });
});
