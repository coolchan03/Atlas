import { additionsFrom } from '../../../src/cpa/refine';
import { pageOrSnippet } from '../../../src/topics/sources';
import { defaultTopics } from '../../../src/cpa/store';

const book = (doc: string, titles: string[]) => ({ doc, chapters: titles.map((title, i) => ({ number: i + 1, title })) });

describe('the outline gets more detailed from the books', () => {
  const far = defaultTopics('FAR');
  it('adds the chapters the checklist lacks under the area they fit, and not the ones it covers', () => {
    const adds = additionsFrom(far, [book('Intermediate Accounting.pdf', ['Inventory', 'Leases', 'Pensions and other retirement benefits', 'Property, plant and equipment', 'Preface'])]);
    const names = adds.map((a) => a.name);
    expect(names).toContain('Pensions and other retirement benefits');
    expect(names).not.toContain('Inventory'); // already on the checklist
    expect(names).not.toContain('Leases');
    expect(names).not.toContain('Preface');
    expect(adds.find((a) => a.name.startsWith('Pensions'))?.from).toBe('Intermediate Accounting.pdf');
  });
  it('is safe to run again, and ignores a book that is not about the exam', () => {
    const once = additionsFrom(far, [book('B.pdf', ['Inventory', 'Pensions and other retirement benefits', 'Bonds payable', 'Leases'])]);
    const topics = [...far, ...once.map((a) => ({ id: a.name, area: a.area, name: a.name, covered: false }))];
    expect(additionsFrom(topics, [book('B.pdf', ['Inventory', 'Pensions and other retirement benefits', 'Bonds payable', 'Leases'])])).toEqual([]);
    expect(additionsFrom(far, [book('Cooking.pdf', ['Sauces', 'Braising', 'Pastry dough'])])).toEqual([]);
  });
});

describe('reading the pages found online', () => {
  const c = { title: 'Leases explained', url: 'https://x.org', snippet: 'A lease transfers the right to use an asset for a period of time in exchange for payment.' };
  it('uses the page when it has content, and the search snippet when the page is blocked or empty', () => {
    expect(pageOrSnippet(c, 'x'.repeat(400))).toHaveLength(400);
    expect(pageOrSnippet(c, 'The page at https://x.org returned no readable content.')).toContain('A lease transfers the right');
    expect(pageOrSnippet(c, null)).toContain('Leases explained');
    expect(pageOrSnippet({ ...c, snippet: 'short' }, null)).toBe('');
  });
});
