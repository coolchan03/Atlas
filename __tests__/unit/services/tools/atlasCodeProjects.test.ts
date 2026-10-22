import { parseCodeFiles } from '../../../../src/services/tools/codeProjects';
describe('Atlas multi-file code projects', () => {
  it('accepts a nested project in a safe relative path', () => {
    const files = parseCodeFiles(JSON.stringify([
      { path: 'src/main.py', content: 'print(1)' },
      { path: 'README.md', content: '# Demo' },
    ]));
    expect(files.map(f => f.path)).toEqual(['src/main.py', 'README.md']);
  });
  it('blocks traversal, absolute paths, duplicate paths and malformed JSON', () => {
    for (const path of ['../secret.txt', '/root/file.txt', 'src/../evil.ts', 'C:/absolute.ts', '.git/config']) {
      expect(() => parseCodeFiles(JSON.stringify([{ path, content: 'x' }]))).toThrow();
    }
    expect(() => parseCodeFiles('not json')).toThrow();
    expect(() => parseCodeFiles(JSON.stringify([
      { path: 'App.ts', content: 'x' }, { path: 'app.ts', content: 'y' },
    ]))).toThrow();
  });
});
