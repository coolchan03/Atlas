import { mergeBooks, asChapters } from '../../../src/topics/multiBook';
import { authorityNote } from '../../../src/topics/formats';
import { documentStanding } from '../../../src/standards/authority';
import { chapterPlan } from '../../../src/topics/chapters';

const book = (doc: string, titles: string[]) => ({ doc, chapters: titles.map((title, i) => ({ number: i + 1, title })) });

describe('a course from all the textbooks', () => {
  const a = book('Intermediate Accounting.pdf', ['Inventory', 'Leases', 'Income taxes', 'Pensions', 'Statement of cash flows']);
  const b = book('Advanced Accounting.pdf', ['Business combinations', 'Leases and sale-leasebacks', 'Income taxes', 'Foreign currency']);
  it('makes the same subject in two books one topic that remembers both books, and keeps chapters only one book has', () => {
    const topics = mergeBooks([a, b]);
    const titles = topics.map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining(['Inventory', 'Leases', 'Income taxes', 'Pensions', 'Business combinations', 'Foreign currency']));
    expect(topics.find((t) => t.title === 'Income taxes')?.docs).toEqual(['Intermediate Accounting.pdf', 'Advanced Accounting.pdf']);
    expect(topics.find((t) => t.title === 'Business combinations')?.docs).toEqual(['Advanced Accounting.pdf']);
    // "Leases" and "Leases and sale-leasebacks" only look alike: they stay two units, so neither book's chapter is hidden inside the other's.
    expect(titles).toEqual(expect.arrayContaining(['Leases', 'Leases and sale-leasebacks']));
    expect(topics.find((t) => t.title === 'Leases')?.docs).toEqual(['Intermediate Accounting.pdf']);
  });
  it('puts a chapter only the second book has beside the chapter it follows, and numbers them in order', () => {
    const titles = mergeBooks([a, b]).map((t) => t.title);
    expect(titles.indexOf('Business combinations')).toBeLessThan(titles.indexOf('Income taxes') + 1);
    expect(asChapters(mergeBooks([a, b])).map((c) => c.number)).toEqual(titles.map((_, i) => i + 1));
  });
  it('says in the plan that every textbook is used', () => {
    const plan = chapterPlan(asChapters(mergeBooks([a, b])), 'FAR', true);
    expect(plan.squares[0].focus).toMatch(/from all the textbooks/);
  });
});

describe('chapters of one book stay separate', () => {
  it('does not fold two alike chapters of the same book into one unit', () => {
    const one = book('Book.pdf', ['Property, plant and equipment: acquisition', 'Property, plant and equipment: depreciation', 'Leases']);
    expect(mergeBooks([one]).map((t) => t.title)).toEqual(one.chapters.map((c) => c.title));
  });
});

describe('chapters with no title', () => {
  it('keeps each book\'s untitled chapter apart (two books\' "Chapter 7" are not the same subject) and gives it no subject to match on', () => {
    const a = { doc: 'Leases book.pdf', chapters: [{ number: 7, title: '' }, { number: 8, title: 'Inventory' }, { number: 9, title: 'Receivables' }] };
    const b = { doc: 'Payroll book.pdf', chapters: [{ number: 7, title: '' }] };
    const titles = mergeBooks([a, b]).map((t) => t.title);
    expect(titles.filter((t) => /^Chapter 7 of /.test(t))).toHaveLength(2);
    const { chapterSquares } = require('../../../src/topics/chapterSequence');
    expect(chapterSquares('Chapter 7', 'Chapter 7', 'x')[0].topic).toBeUndefined();
    expect(chapterSquares('Chapter 7: Leases', 'Chapter 7: Leases', 'x')[0].topic).toBe('Leases');
  });
});

describe('a standard outranks the books', () => {
  it('ranks a FASB document and the Code above a textbook, and says so in the lesson prompt', () => {
    expect(documentStanding('ASC 842 Leases (FASB).pdf')).toMatchObject({ rank: 1, label: 'STANDARD' });
    expect(documentStanding('Title 26 - Internal Revenue Code.pdf').rank).toBe(1);
    expect(documentStanding('Intermediate Accounting.pdf')).toMatchObject({ rank: 5, label: 'textbook' });
    const note = authorityNote([{ source: 'ASC 842 (FASB).pdf', rank: 1 }, { source: 'Intermediate Accounting.pdf', rank: 5 }]);
    expect(note).toMatch(/different books/);
    expect(note).toMatch(/STANDARD/);
    expect(note).toMatch(/older books may still show the old rule/);
    expect(authorityNote([{ source: 'A.pdf', rank: 5 }])).toBe('');
  });
});

describe('every book chapter stays identifiable', () => {
  it('remembers each chapter of each book behind a merged topic', () => {
    const topics = mergeBooks([
      book('A.pdf', ['Inventory', 'Income taxes', 'Pensions']),
      { doc: 'B.pdf', chapters: [{ number: 12, title: 'Income taxes' }, { number: 13, title: 'Segment reporting' }, { number: 14, title: 'Interim reporting' }] },
    ]);
    expect(topics.find((t) => t.title === 'Income taxes')?.members).toEqual([
      { doc: 'A.pdf', number: 2, title: 'Income taxes' }, { doc: 'B.pdf', number: 12, title: 'Income taxes' },
    ]);
    const all = topics.flatMap((t) => t.members);
    expect(all).toHaveLength(6); // no chapter of either book was dropped
  });
  it('does not merge lookalike titles that are different subjects', () => {
    const topics = mergeBooks([
      book('A.pdf', ['Income taxes', 'Revenue recognition', 'Cash flows']),
      book('B.pdf', ['Income statement', 'Revenue from contracts', 'Cash and equivalents']),
    ]);
    expect(topics).toHaveLength(6);
    expect(topics.every((t) => t.docs.length === 1)).toBe(true);
  });
  it('merges the same chapter written with other plural or -ing forms', () => {
    const topics = mergeBooks([book('A.pdf', ['Accounting for leases', 'Income taxes', 'Pensions']), book('B.pdf', ['Accounting for lease', 'Income tax', 'Inventory'])]);
    expect(topics.find((t) => /leases?$/i.test(t.title))?.docs).toHaveLength(2);
  });
});

describe('a course remembers the chapters of every book', () => {
  it('keeps bookChapters on the saved course', () => {
    const { useTopics } = require('../../../src/topics/store');
    const members = [{ doc: 'A.pdf', number: 1, title: 'Leases' }, { doc: 'B.pdf', number: 4, title: 'Leases' }];
    const id = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 }, { title: 'T', summary: '', style: '', theme: '', squares: [] }, { bookChapters: members });
    expect(useTopics.getState().courses.find((c: { id: string }) => c.id === id).bookChapters).toEqual(members);
  });
});
