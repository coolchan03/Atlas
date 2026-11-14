import { chapterSquares, CHAPTER_SQUARES } from '../../../src/topics/chapterSequence';
import { examPlan } from '../../../src/cpa/course';
import { MAX_SQUARES } from '../../../src/topics/formats';

describe('a chapter on the board', () => {
  it('is six squares: the reading, key terms, a worked example, a quiz, an assignment and a chapter exam', () => {
    const sq = chapterSquares('Leases', 'Area 1', 'for the FAR exam');
    expect(sq).toHaveLength(CHAPTER_SQUARES);
    expect(sq.map((s) => s.format)).toEqual(['lesson', 'cards', 'worked', 'quiz', 'practice', 'quiz']);
    expect(sq[0].title).toBe('Leases');
    expect(sq.map((s) => s.title).slice(1)).toEqual(['Leases: key terms', 'Leases: worked example', 'Leases: quiz', 'Leases: assignment', 'Leases: chapter exam']);
    expect(sq.filter((s) => s.checkpoint)).toHaveLength(1);
    expect(sq.every((s) => s.unit === 'Area 1')).toBe(true);
  });

  it('keeps every title within 60 characters, even for a long chapter name', () => {
    const sq = chapterSquares('A very long chapter name about conceptual frameworks and standard setting in financial reporting', 'U', 'x');
    for (const s of sq) expect(s.title.length).toBeLessThanOrEqual(60);
    expect(new Set(sq.map((s) => s.title)).size).toBe(6);
  });

  it('makes an exam board about six times longer than its checklist, with a review exam per area and a whole-exam check', () => {
    const topics = Array.from({ length: 24 }, (_, i) => ({ id: `t${i}`, name: `Topic ${i + 1}`, area: i < 12 ? 'Area A' : 'Area B' })) as never[];
    const plan = examPlan('FAR' as never, topics);
    expect(plan.squares).toHaveLength(24 * 6 + 2 + 1);
    expect(plan.squares[0].format).toBe('lesson');
    expect(plan.squares.at(-1)?.title).toBe('Whole exam check');
    expect(plan.squares.length).toBeLessThanOrEqual(MAX_SQUARES);
    expect(new Set(plan.squares.map((s) => s.key)).size).toBe(plan.squares.length);
  });
});

describe('how much the reading says', () => {
  it('asks for the whole chapter for beginners and a summary with the rules for experts, on lesson squares only', () => {
    const { contentMessages } = require('../../../src/topics/formats');
    const base = { courseTitle: 'C', topic: 'T', level: 'x', how: '', style: '', before: [], minutes: 20 };
    const ask = (format: string, difficulty?: string) => contentMessages({ ...base, difficulty, square: { key: 's1', format, title: 'Leases', focus: 'f', unit: 'u' } } as never).user as string;
    expect(ask('lesson', 'beginner')).toContain('full chapter');
    expect(ask('lesson', 'moderate')).toContain('condensed chapter');
    expect(ask('lesson', 'hard')).toContain('expert summary');
    expect(ask('quiz', 'beginner')).not.toContain('READING');
    expect(ask('lesson')).not.toContain('READING');
  });
});
