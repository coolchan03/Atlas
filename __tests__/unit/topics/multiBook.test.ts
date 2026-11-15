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
    expect(topics.find((t) => t.title === 'Leases')?.docs).toHaveLength(2);
    expect(topics.find((t) => t.title === 'Business combinations')?.docs).toEqual(['Advanced Accounting.pdf']);
    expect(titles.filter((t) => /leases/i.test(t))).toHaveLength(1);
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
