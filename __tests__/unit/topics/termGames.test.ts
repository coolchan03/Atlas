import { isTermGame, parseContent, FORMATS, FORMAT_IDS } from '../../../src/topics/formats';
import { deepChapter } from '../../../src/topics/chapterSequence';
import { useTopics } from '../../../src/topics/store';
import { studyGuideHtml } from '../../../src/topics/studyGuide';

const terms = (n: number) => JSON.stringify({ terms: Array.from({ length: n }, (_, i) => ({ answer: ['Revenue', 'Expense', 'Liability', 'Equity', 'Asset', 'Ledger', 'Journal', 'Balance'][i % 8], clue: `Clue number ${i}` })) });

describe('word games as course squares', () => {
  it('has a crossword, word search, scramble, memory match and guess-the-term on the menu the AI chooses from', () => {
    for (const f of ['crossword', 'wordsearch', 'scramble', 'memory', 'hangman']) { expect(FORMAT_IDS).toContain(f); expect(isTermGame(f)).toBe(true); }
    expect(FORMATS.find((f) => f.id === 'crossword')!.use).toMatch(/crossword/);
    expect(isTermGame('quiz')).toBe(false);
  });

  it('reads terms as one word of letters, drops a clue that gives the answer away and repeats, and needs enough terms', () => {
    const c: any = parseContent('crossword', JSON.stringify({ terms: [
      { answer: 'Revenue', clue: 'Money earned' }, { answer: 'Expense', clue: 'Money spent' }, { answer: 'Cash flow', clue: 'Money moving' },
      { answer: 'Asset', clue: 'The asset is owned' }, { answer: 'Equity', clue: 'Owners share' }, { answer: 'Ledger', clue: 'Book of accounts' }, { answer: 'ledger', clue: 'again' }, { answer: 'Journal', clue: 'Daily record' },
    ] }));
    expect(c.kind).toBe('terms');
    expect(c.game).toBe('crossword');
    expect(c.terms.map((t: any) => t.answer)).toEqual(['Revenue', 'Expense', 'Cashflow', 'Equity', 'Ledger', 'Journal']);
    expect(parseContent('crossword', terms(3))).toBeNull();
    expect(parseContent('scramble', JSON.stringify({ terms: [{ answer: 'Cash', clue: 'x' }, { answer: 'Ledger', clue: 'w' }, { answer: 'Debit', clue: 'y' }, { answer: 'Credit', clue: 'z' }, { answer: 'Assets', clue: 'a' }, { answer: 'Equity', clue: 'b' }] }))?.kind).toBe('terms');
  });

  it('a memory match may use short phrases', () => {
    const c: any = parseContent('memory', JSON.stringify({ terms: [{ answer: 'Accrual basis', clue: 'Record when earned' }, { answer: 'Cash basis', clue: 'Record when paid' }, { answer: 'Fund', clue: 'A set of accounts' }, { answer: 'Deferral', clue: 'Postponed' }] }));
    expect(c.terms.map((t: any) => t.answer)).toContain('Accrual basis');
  });

  it('a deeper chapter can include the games, after its other extra practice', () => {
    const big = deepChapter({ name: '1 – Cash', unit: 'u', about: 'of the book' }, 18).map((s) => s.format);
    expect(big.slice(-5)).toEqual(['crossword', 'wordsearch', 'scramble', 'memory', 'quiz']);
  });

  it('the learner can add any kind of square after the one they are on, in the same chapter, and the board stays in order', () => {
    const course: any = { id: 'g1', topic: 't', title: 't', summary: '', style: '', theme: '', request: {}, createdAt: 1, sources: [], content: {}, progress: {},
      squares: [{ key: 's1', format: 'lesson', title: 'A', focus: 'a', unit: 'U1', topic: 'Cash' }, { key: 's2', format: 'quiz', title: 'B', focus: 'b', unit: 'U2' }] };
    useTopics.setState({ courses: [course] });
    const key = useTopics.getState().addSquare('g1', 's1', { format: 'crossword', title: 'Crossword: U1', focus: 'Crossword on Cash' });
    const squares = useTopics.getState().courses[0].squares;
    expect(key).toBe('s3');
    expect(squares.map((s) => s.key)).toEqual(['s1', 's3', 's2']);
    expect(squares[1]).toMatchObject({ format: 'crossword', unit: 'U1', topic: 'Cash' });
  });

  it('a printable guide lists the terms and clues', () => {
    const course: any = { title: 'C', summary: '', squares: [{ key: 's1', format: 'crossword', title: 'X', focus: '', unit: 'U' }], content: { s1: { kind: 'terms', game: 'crossword', terms: [{ answer: 'Revenue', clue: 'Money earned' }] } } };
    expect(studyGuideHtml(course)).toContain('<td>Revenue</td><td>Money earned</td>');
  });
});
