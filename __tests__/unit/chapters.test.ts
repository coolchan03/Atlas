import { chapterName, findChapters } from '../../src/topics/chapters';

const body = (word: string) => `${word} text. `.repeat(200);

it('finds real chapters and skips the table of contents entries', () => {
  const text = [
    'Contents', 'Chapter 1 Basis ........ 3', 'Chapter 2 Gains ........ 40', 'Chapter 3 Leases ........ 80', '',
    'CHAPTER 1: Basis', body('basis'), 'CHAPTER 2 Gains and losses', body('gains'), 'Chapter 3. Leases', body('leases'),
  ].join('\n');
  const chapters = findChapters(text);
  expect(chapters.map((c) => c.number)).toEqual([1, 2, 3]);
  expect(chapters.map(chapterName)).toEqual(['Chapter 1: Basis', 'Chapter 2: Gains and losses', 'Chapter 3: Leases']);
});

it('reads roman numerals and units, and finds nothing in a text with no chapters', () => {
  const text = `Unit IV - Ratios\n${body('ratio')}\nUnit V Rates\n${body('rate')}`;
  expect(findChapters(text).map((c) => `${c.number}:${c.title}`)).toEqual(['4:Ratios', '5:Rates']);
  expect(findChapters('Just a long essay. '.repeat(500))).toEqual([]);
});

it('works on page-numbered chunks from a PDF read by page', () => {
  const text = `(p. 12) Chapter 8: Bonds\n${body('bond')}\n(p. 60) Chapter 9: Equity\n${body('equity')}`;
  expect(findChapters(text).map((c) => c.number)).toEqual([8, 9]);
});
