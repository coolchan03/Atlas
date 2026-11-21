import { expandLessons, CHAPTER_SQUARES } from '../../../src/topics/chapterSequence';
import type { PlannedSquare } from '../../../src/topics/plannedSquare';

const lesson = (n: number): PlannedSquare => ({ key: `x${n}`, format: 'lesson', title: `Topic ${n}`, focus: `about ${n}`, unit: `Unit ${Math.ceil(n / 5)}` });

describe('expandLessons never cuts a chapter in the middle', () => {
  it('turns each lesson into a full chapter in the order given', () => {
    const out = expandLessons([lesson(1), lesson(2)], 400);
    expect(out).toHaveLength(2 * CHAPTER_SQUARES);
    expect(out.map((s) => s.key)).toEqual(Array.from({ length: 12 }, (_, i) => `s${i + 1}`));
    expect(out[0].title).toBe('Topic 1');
    expect(out[CHAPTER_SQUARES].title).toBe('Topic 2');
  });

  it('keeps whole chapters when the course is too long: the last kept chapter still ends in its chapter exam', () => {
    const lessons = Array.from({ length: 70 }, (_, i) => lesson(i + 1)); // 420 squares, over the 399 cap
    const out = expandLessons(lessons, 399);
    expect(out.length).toBeLessThanOrEqual(399);
    expect(out.length % CHAPTER_SQUARES).toBe(0); // only whole chapters
    const last = out[out.length - 1];
    expect(last.checkpoint).toBe(true);
    expect(last.title).toMatch(/chapter exam$/);
    // the chapters kept are the first ones, in order, with no gap
    const lessonsKept = out.filter((s) => s.format === 'lesson').map((s) => s.title);
    expect(lessonsKept).toEqual(Array.from({ length: lessonsKept.length }, (_, i) => `Topic ${i + 1}`));
    expect(lessonsKept.length).toBe(66);
  });

  it('does not keep a small square that comes after a chapter that was dropped', () => {
    const lessons = Array.from({ length: 66 }, (_, i) => lesson(i + 1));
    const tail: PlannedSquare = { key: 't', format: 'match', title: 'Match terms', focus: 'terms', unit: 'Unit 14' };
    const out = expandLessons([...lessons, lesson(67), tail], 399); // 67 chapters = 402: the 67th does not fit, so the match square after it must not appear either
    expect(out.some((s) => s.title === 'Match terms')).toBe(false);
    expect(out.filter((s) => s.format === 'lesson')).toHaveLength(66);
  });

  it('keeps other squares in their place, and drops the plain quiz right after a lesson (the chapter has its own)', () => {
    const quiz: PlannedSquare = { key: 'q', format: 'quiz', title: 'Quick quiz', focus: 'x', unit: 'Unit 1' };
    const match: PlannedSquare = { key: 'm', format: 'match', title: 'Match', focus: 'x', unit: 'Unit 1' };
    const out = expandLessons([lesson(1), quiz, match], 400);
    expect(out.some((s) => s.title === 'Quick quiz')).toBe(false);
    expect(out[out.length - 1].title).toBe('Match');
    expect(out).toHaveLength(CHAPTER_SQUARES + 1);
  });

  it('a course within the cap is not shortened at all', () => {
    const out = expandLessons(Array.from({ length: 10 }, (_, i) => lesson(i + 1)), 399);
    expect(out).toHaveLength(60);
  });
});
