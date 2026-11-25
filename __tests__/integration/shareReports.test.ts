/** Sharing a subject's reports: a big pile goes out as a file, never as one huge text that hangs the phone's share sheet. */
import { installNativeBoundary } from '../harness/nativeBoundary';

jest.mock('../../src/atlasTools/deviceTools', () => ({ workspaceDir: async () => '/workspace' }));

const report = (n: number) => ({ q: `Question ${n}`, text: 'A long report. '.repeat(500), status: 'pass', score: 8, why: 'Sound.', sources: 'source text '.repeat(200), at: 1_700_000_000_000 + n });

it('shares the reports as a file when it can, and as text cut to a safe size when it cannot', async () => {
  installNativeBoundary({ fs: true });
  const { shareReports } = require('../../src/learning/lessonsFile');
  const reports = Array.from({ length: 100 }, (_, i) => report(i)); // about 1 MB of text

  const shared: Array<{ title: string; text?: string; file?: string }> = [];
  const ok = await shareReports('Tax', { reports }, async (item: { title: string; text?: string; file?: string }) => { shared.push(item); return true; });
  expect(ok.how).toBe('file');
  expect(shared).toHaveLength(1);
  expect(shared[0].file).toMatch(/Learning\/.*\.md$/);
  expect(shared[0].text).toBeUndefined(); // the megabyte of text is not sent through the share sheet

  // The phone cannot share the file: the text goes instead, cut to what the share sheet can carry, and says so.
  const second: Array<{ text?: string; file?: string }> = [];
  const fallback = await shareReports('Tax', { reports }, async (item: { text?: string; file?: string }) => { second.push(item); return !!item.text; });
  expect(fallback.how).toBe('text');
  expect(second[1].text!.length).toBeLessThan(101_000);
  expect(second[1].text).toMatch(/\[Cut: [\d,]+ characters in all\. The full text is in the saved file\.\]$/);

  // Nothing can be shared: it says so instead of failing silently.
  expect((await shareReports('Tax', { reports: reports.slice(0, 2) }, async () => false)).how).toBe('failed');
});

it('writes every report the subject ever wrote from its archive, a page at a time, not only the few the screen keeps', async () => {
  installNativeBoundary({ fs: true });
  const { shareReports } = require('../../src/learning/lessonsFile');
  const RNFS = require('react-native-fs');
  const archive = Array.from({ length: 2500 }, (_, i) => ({ ...report(i), q: `Archived question ${i}`, text: 'A report. '.repeat(20), sources: '' }));
  const pages: number[] = [];
  const shared: Array<{ file?: string }> = [];
  const done = await shareReports('Tax', { reports: archive.slice(0, 40), archive: {
    subjectId: 'tax', count: () => archive.length,
    page: (limit: number, offset: number) => { pages.push(offset); return archive.slice(offset, offset + limit); },
  } }, async (item: { file?: string }) => { shared.push(item); return true; });
  expect(done.how).toBe('file');
  expect(pages).toHaveLength(25); // 2,500 reports in pages of 100
  const text = await RNFS.readFile(shared[0].file, 'utf8');
  expect(text.startsWith('# Reports on Tax\n\n2500 reports, newest first.')).toBe(true);
  expect(text).toContain('## Archived question 0');
  expect(text).toContain('## Archived question 2499');
  expect((text.match(/^## Archived question /gm) ?? []).length).toBe(2500);
});
