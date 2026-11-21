import { boundsProblems, classifyEntry, MAX_ENTRIES, summarizeStage, type StagedZip } from '../../src/learning/zipStaging';

describe('UX-08 zip staging', () => {
  it.each([
    ['Textbook/chapter1.pdf', 5000, 'document'], ['notes.md', 10, 'document'], ['FAR question bank.csv', 900, 'questions'],
    ['mock-exam-1.json', 900, 'questions'], ['inner.zip', 100, 'archive'], ['setup.exe', 100, 'unsupported'], ['empty.pdf', 0, 'unsupported'],
    ['../etc/passwd', 10, 'unsafe'], ['a/../../b.pdf', 10, 'unsafe'], ['/abs/path.pdf', 10, 'unsafe'], ['a/%2e%2e/b.pdf', 10, 'unsafe'], ['a\\..\\b.pdf', 10, 'unsafe'],
  ])('%s -> %s', (name, size, kind) => expect(classifyEntry(name as string, size as number).kind).toBe(kind));

  it('refuses too many files, too much unpacked data and absurd compression', () => {
    expect(boundsProblems(1000, Array.from({ length: MAX_ENTRIES + 1 }, () => ({ size: 1 }))).join(' ')).toMatch(/more than/);
    expect(boundsProblems(1000, [{ size: 4 * 1024 ** 3 }]).join(' ')).toMatch(/3 GB/);
    expect(boundsProblems(1000, [{ size: 500_000 }]).join(' ')).toMatch(/compressed far more/);
    expect(boundsProblems(1_000_000, [{ size: 5_000_000 }])).toEqual([]);
  });
  it('the summary counts add up to every file (nothing silently dropped)', () => {
    const entries = [classifyEntry('a.pdf', 1), classifyEntry('questions.csv', 1), classifyEntry('x.zip', 1), classifyEntry('y.bin', 1), classifyEntry('../z.pdf', 1)]
      .map((c, i) => ({ name: `f${i}`, path: `/p/f${i}`, size: 1, ...c }));
    const counts = { document: 0, questions: 0, archive: 0, unsupported: 0, unsafe: 0 } as StagedZip['counts'];
    entries.forEach((e) => { counts[e.kind]++; });
    const text = summarizeStage({ dir: '/p', entries, counts });
    expect(text).toMatch(/^5 files in the zip: 1 book or document, 1 question file, 1 zip inside \(not opened\), 1 not readable, 1 refused/);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(entries.length);
  });
});
