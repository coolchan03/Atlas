import { coverageView } from '../../../src/topics/coverageView';

const sq = (key: string, unit: string, format = 'lesson') => ({ key, unit, format, title: key, focus: key } as any);
const course = (over: any = {}) => ({
  bookChapters: [{ doc: 'A.pdf', number: 1, title: 'Leases' }, { doc: 'B.pdf', number: 4, title: 'Leases' }, { doc: 'A.pdf', number: 2, title: 'Appendix tables' }],
  squares: [sq('l1', 'Leases'), sq('q1', 'Leases', 'quiz'), sq('l2', 'Tables'), sq('q2', 'Tables', 'quiz')],
  content: { l1: {}, q1: {}, l2: {} }, progress: { q1: { stars: 3 } }, ...over,
});

describe('what a course covers', () => {
  it('counts a chapter as taught only when written AND its tests passed', () => {
    const v = coverageView(course());
    expect(Object.fromEntries(v.units.map((u) => [u.unit, u.state]))).toEqual({ Leases: 'tested', Tables: 'written' });
    expect(coverageView(course({ progress: { q1: { stars: 1 } } })).units[0].state).toBe('written');
    expect(coverageView(course({ content: {}, progress: {} })).units.every((u) => u.state === 'not-written')).toBe(true);
  });

  it('lists the books and chapters, and maps exam objectives with gaps and unmatched chapters', () => {
    const v = coverageView(course(), [{ id: 'l', name: 'Leases' }, { id: 'd', name: 'Derivatives and hedging' }]);
    expect(v.books).toEqual([{ doc: 'A.pdf', chapters: 2 }, { doc: 'B.pdf', chapters: 1 }]);
    expect(v.objectives[0]).toContain('2 books');
    expect(v.gaps).toEqual(['Derivatives and hedging']);
    expect(v.objectives[1]).toMatch(/no chapter in your books matches this/);
    expect(v.unmatched).toEqual(['A ch. 2: Appendix tables']);
  });

  it('is honest about what it cannot claim', () => {
    expect(coverageView(course({ bookChapters: undefined })).caveats[0]).toMatch(/not planned chapter by chapter/);
    expect(coverageView(course({ bookChapters: [{ doc: 'A.pdf', number: 1, title: 'X' }] })).caveats.join(' ')).toMatch(/Only one book/);
    expect(coverageView(course()).caveats.join(' ')).toMatch(/does not prove/);
  });
});
