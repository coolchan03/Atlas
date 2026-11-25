/** The person's plain-words guide on how to use each document: code reads which document each sentence names. */
import { guideLabel, guideOverrules, guideSkips, readGuide } from '../../src/standards/guide';
import { sourceContext } from '../../src/standards/profiles';

const NAMES = ['Tax Handbook 2023.pdf', 'Code 2024.pdf', 'Memo 2025.pdf', 'Old Notes.txt'];
const GUIDE = 'Take only the general rules from the Tax Handbook.\nRead all of Code 2024.\nThe Memo 2025 is the most up to date; it replaces the others where they differ.\nIgnore the old notes.';

it('gives each named document one use, and leaves unnamed ones alone', () => {
  const read = Object.fromEntries(readGuide(GUIDE, NAMES).map((e) => [e.name, e.use]));
  expect(read).toEqual({ 'Tax Handbook 2023.pdf': 'general', 'Code 2024.pdf': 'all', 'Memo 2025.pdf': 'newest', 'Old Notes.txt': 'skip' });
  expect(readGuide('Be careful with everything.', NAMES)).toEqual([]);
});

it('labels each excerpt, leaves skipped documents out, and hands the guide to the AI as written', () => {
  const ctx = sourceContext(null, { guide: GUIDE, names: NAMES, query: 'q', chunkNames: NAMES, now: new Date() });
  expect(ctx.rules).toContain('Take only the general rules from the Tax Handbook');
  expect(ctx.label?.('Memo 2025.pdf')).toMatch(/most up to date/);
  expect(ctx.label?.('Tax Handbook 2023.pdf')).toMatch(/only its general rules/);
  expect([...ctx.retired]).toEqual(['Old Notes.txt']);
  const entries = readGuide(GUIDE, NAMES);
  expect(guideLabel(entries, 'Code 2024.pdf')).toMatch(/read all of it/);
  expect([...guideSkips(entries)]).toEqual(['Old Notes.txt']);
});

it('lets the document called the newest win a disagreement, and says nothing when the guide does not decide', () => {
  const entries = readGuide(GUIDE, NAMES);
  expect(guideOverrules(entries, [{ title: 'Memo 2025.pdf' } as never], [{ title: 'Code 2024.pdf' } as never])).toBe(true);
  expect(guideOverrules(entries, [{ title: 'Code 2024.pdf' } as never], [{ title: 'Memo 2025.pdf' } as never])).toBe(false);
  expect(guideOverrules(entries, [{ title: 'Code 2024.pdf' } as never], [{ title: 'Tax Handbook 2023.pdf' } as never])).toBeNull();
  expect(guideOverrules([], [{ title: 'Memo 2025.pdf' } as never], [])).toBeNull();
});

it('reads a document named with its file extension, and a version number with a dot', () => {
  const names = ['Memo 2025.pdf', 'Guide v2.1.pdf'];
  const read = Object.fromEntries(readGuide('Memo 2025.pdf is the most up to date. Ignore Guide v2.1.pdf.', names).map((e) => [e.name, e.use]));
  expect(read).toEqual({ 'Memo 2025.pdf': 'newest', 'Guide v2.1.pdf': 'skip' });
});
