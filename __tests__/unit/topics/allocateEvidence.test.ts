import { allocateExcerpts } from '../../../src/topics/allocateEvidence';
import { mapObjectives, describeMap } from '../../../src/cpa/chapterMap';

const ex = (source: string, n: number, role: 'teach' | 'reference' = 'teach', rank = role === 'reference' ? 1 : 5) => ({ source, role, rank, text: `${source} passage ${n}` });

describe('sharing the room in a lesson between books and standards', () => {
  it('keeps the standard when textbook passages would fill every place', () => {
    const found = [...[1, 2, 3, 4, 5, 6].map((n) => ex('Book A.pdf', n)), ex('ASC 842.pdf', 1, 'reference'), ex('ASC 842.pdf', 2, 'reference')];
    const out = allocateExcerpts(found, 5, 2);
    expect(out.chosen).toHaveLength(5);
    expect(out.chosen.filter((e) => e.role === 'reference')).toHaveLength(2);
    expect(out.omitted).toBe(3);
  });

  it('gives every book a passage before any book gets a second', () => {
    const found = [...[1, 2, 3].map((n) => ex('A.pdf', n)), ...[1, 2, 3].map((n) => ex('B.pdf', n)), ...[1, 2].map((n) => ex('C.pdf', n))];
    const out = allocateExcerpts(found, 4, 0);
    expect(new Set(out.chosen.map((e) => e.source))).toEqual(new Set(['A.pdf', 'B.pdf', 'C.pdf']));
    expect(out.droppedSources).toEqual([]);
  });

  it('reports a source that had passages but no room, and uses spare reference room', () => {
    const found = [ex('A.pdf', 1), ex('B.pdf', 1), ex('C.pdf', 1), ex('Code.pdf', 1, 'reference'), ex('Code.pdf', 2, 'reference'), ex('Code.pdf', 3, 'reference')];
    const out = allocateExcerpts(found, 3, 1);
    expect(out.chosen).toHaveLength(3);
    expect(out.droppedSources).toEqual(['C.pdf']);
    expect(out.omitted).toBe(3);
    const small = allocateExcerpts([ex('A.pdf', 1), ex('Code.pdf', 1, 'reference'), ex('Code.pdf', 2, 'reference')], 7, 1);
    expect(small.chosen).toHaveLength(3); // nothing is left out when there is room
    expect(small.omitted).toBe(0);
  });

  it('puts the highest-ranked passages first within a role and handles nothing found', () => {
    const out = allocateExcerpts([ex('Notes.pdf', 1, 'teach', 5), ex('Pub 535.pdf', 1, 'teach', 3)], 5);
    expect(out.chosen.map((e) => e.source)[0]).toBe('Pub 535.pdf');
    expect(allocateExcerpts([], 5)).toEqual({ chosen: [], omitted: 0, used: [], droppedSources: [] });
  });
});

describe('objectives and chapters side by side', () => {
  const chapters = [
    { doc: 'A.pdf', number: 5, title: 'Leases' }, { doc: 'B.pdf', number: 9, title: 'Leases and sale-leasebacks' },
    { doc: 'A.pdf', number: 6, title: 'Pensions' }, { doc: 'A.pdf', number: 7, title: 'Appendix tables' }, { doc: 'B.pdf', number: 3, title: '' },
  ];
  const objectives = [{ id: 'l', name: 'Leases' }, { id: 'd', name: 'Derivatives and hedging' }, { id: 'p', name: 'Pension plans' }];

  it('maps each objective to the chapters of every book that match, and lists gaps and unmatched chapters', () => {
    const map = mapObjectives(objectives, chapters);
    expect(map.links[0].chapters.map((c) => `${c.doc}#${c.number}`)).toEqual(['A.pdf#5', 'B.pdf#9']);
    expect(map.links[0].books).toEqual(['A.pdf', 'B.pdf']);
    expect(map.gaps.map((g) => g.name)).toEqual(['Derivatives and hedging']);
    expect(map.unmapped.map((c) => `${c.doc}#${c.number}`)).toEqual(['A.pdf#7', 'B.pdf#3']);
  });

  it('says plainly when no book matches an objective', () => {
    const lines = describeMap(mapObjectives(objectives, chapters));
    expect(lines[1]).toBe('Derivatives and hedging: no chapter in your books matches this');
    expect(lines[0]).toContain('2 books');
  });
});
