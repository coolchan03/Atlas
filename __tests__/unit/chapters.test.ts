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

describe('one textbook at a time', () => {
  it('lays out every chapter of the first book, then every chapter of the second, each with its book', () => {
    const { bookByBookPlan } = require('../../src/topics/chapters');
    const chap = (n: number, subject: string) => ({ number: n, title: `${subject} heading`, size: 5000, subject });
    const plan = bookByBookPlan([
      { doc: 'Intermediate_Accounting.pdf', chapters: [chap(1, 'Cash'), chap(2, 'Leases')] },
      { doc: 'Auditing.pdf', chapters: [chap(1, 'Risk'), chap(2, 'Evidence'), chap(3, 'Reports')] },
    ], 'FAR');
    const lessons = plan.squares.filter((s: any) => s.format === 'lesson');
    expect(lessons.map((s: any) => s.book)).toEqual(['Intermediate_Accounting.pdf', 'Intermediate_Accounting.pdf', 'Auditing.pdf', 'Auditing.pdf', 'Auditing.pdf']);
    expect(lessons[0].unit).toBe('Intermediate Accounting: 1 – Cash');
    // Within a chapter: read, then assignment and quiz, before the next chapter starts.
    const first = plan.squares.filter((s: any) => s.unit === lessons[0].unit).map((s: any) => s.format);
    expect(first[0]).toBe('lesson');
    expect(first).toContain('practice');
    expect(first).toContain('quiz');
    expect(plan.squares.indexOf(lessons[1])).toBeGreaterThan(plan.squares.findLastIndex((s: any) => s.unit === lessons[0].unit));
  });
});

describe('bigger exams over several chapters', () => {
  const chap = (n: number) => ({ number: n, title: `Topic ${n} heading`, size: 5000, subject: `Topic ${n}` });
  it('adds a review exam after every fourth chapter (not right before the final exam), a final exam per book, and one whole-course exam', () => {
    const { bookByBookPlan, chapterPlan } = require('../../src/topics/chapters');
    const nine = Array.from({ length: 9 }, (_, i) => chap(i + 1));
    const single = chapterPlan(nine, 'Book').squares.filter((s: any) => /review exam|final exam/.test(s.title)).map((s: any) => s.title);
    expect(single).toEqual(['Book: chapters 1-4 review exam', 'Book: chapters 5-8 review exam', 'Book: final exam']);
    const eight = Array.from({ length: 8 }, (_, i) => chap(i + 1));
    expect(chapterPlan(eight, 'Book').squares.filter((s: any) => /review exam/.test(s.title))).toHaveLength(1); // after 4; the 8th is followed by the final exam
    const plan = bookByBookPlan([{ doc: 'A.pdf', chapters: [chap(1), chap(2)] }, { doc: 'B.pdf', chapters: [chap(1)] }], 'Course');
    const exams = plan.squares.filter((s: any) => s.checkpoint && !/chapter exam/.test(s.title)).map((s: any) => s.title);
    expect(exams).toEqual(['A: final exam', 'Course: whole course exam']); // one chapter alone has no final exam of its own
    const last = plan.squares[plan.squares.length - 1];
    expect(last.unit).toBe('B: 1 – Topic 1'); // an exam sits in the unit of the chapter it follows, so it is not a chapter of its own
    expect(new Set(plan.squares.filter((s: any) => /(review|final|whole course) exam/.test(s.title)).map((s: any) => s.unit)).size).toBe(2);
    expect(new Set(plan.squares.map((s: any) => s.key)).size).toBe(plan.squares.length);
  });
});

describe('finding every chapter', () => {
  it('keeps a chapter whose first section starts soon after its heading, and does not let a part take a chapter number', () => {
    const text = [
      'Chapter 1: Basis', 'Part 1', body('basis one'), 'Part 2', body('basis two'),
      'Chapter 2: Gains', 'Lesson 1', 'short intro', 'Lesson 2', body('gains'),
      'Chapter 3: Leases', body('leases'),
    ].join('\n');
    const chapters = findChapters(text);
    expect(chapters.map((c) => `${c.number}:${c.title}`)).toEqual(['1:Basis', '2:Gains', '3:Leases']);
  });

  it('reads chapters numbered in words and lists them from the first', () => {
    const text = `Chapter Two: Gains\n${body('gains')}\nChapter One: Basis\n${body('basis')}\nChapter Three: Leases\n${body('leases')}`;
    expect(findChapters(text).map((c) => c.number)).toEqual([1, 2, 3]);
  });
});
