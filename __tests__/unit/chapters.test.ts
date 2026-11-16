import { chapterName, findChapters } from '../../src/topics/chapters';

const body = (word: string) => `${word} text. `.repeat(200);

it('finds real chapters and skips the table of contents entries', () => {
  const text = [
    'Contents', 'Chapter 1 Basis ........ 3', 'Chapter 2 Gains ........ 40', 'Chapter 3 Leases ........ 80', '',
    'CHAPTER 1: Basis', body('basis'), 'CHAPTER 2 Gains and losses', body('gains'), 'Chapter 3. Leases', body('leases'),
  ].join('\n');
  const chapters = findChapters(text);
  expect(chapters.map((c) => c.number)).toEqual([1, 2, 3]);
  expect(chapters.map(chapterName)).toEqual(['1 – Basis', '2 – Gains and losses', '3 – Leases']);
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

import { friendlyTitle, parseSubjects, shortSubject, subjectPrompt } from '../../src/topics/chapters';

describe('naming a chapter for what it is about', () => {
  it('keeps a short heading and cuts a long one at its first clause', () => {
    expect(shortSubject('Cash and Cash Equivalents')).toBe('Cash and Cash Equivalents');
    expect(shortSubject('Liabilities')).toBe('Liabilities');
    expect(shortSubject('Assume the County chooses to report the Television Reception Improvement Fund as a special revenue fund')).toBe('County');
    expect(shortSubject('Understanding governmental funds and how they are reported to citizens')).toBe('Governmental funds');
    expect(shortSubject('')).toBe('');
  });

  it('shows an old long chapter title the new way, keeping the square kind after it', () => {
    expect(friendlyTitle('Chapter 1: Understanding governmental funds and how they are reported to citizens: key terms')).toBe('1 – Governmental funds: key terms');
    expect(friendlyTitle('Chapter 2: Leases')).toBe('2 – Leases');
    expect(friendlyTitle('Lesson plan basics')).toBe('Lesson plan basics');
  });

  it('asks the AI for one subject per chapter and reads the answer strictly', () => {
    const chapters = [{ number: 1, title: 'Assume the county...', size: 5000, lead: 'Cash is received' }, { number: 2, title: 'Debts', size: 5000 }];
    expect(subjectPrompt(chapters).user).toContain('JSON array of 2 strings');
    expect(parseSubjects('Sure: ["Cash", "2. Liabilities"]', 2)).toEqual(['Cash', 'Liabilities']);
    expect(parseSubjects('["Cash"]', 2)).toBeNull();
    expect(parseSubjects('no json', 2)).toBeNull();
  });
});
