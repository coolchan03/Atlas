import { answerIndex, parseContent } from '../../../src/topics/formats';

const opts = ['Straight line', 'Declining balance', 'Units of production'];
const quizJson = (qs: unknown[]) => JSON.stringify({ questions: qs });
const q = (n: number, answer?: unknown, extra: Record<string, unknown> = {}) => ({ q: `Question number ${n}?`, options: opts, why: 'Because.', ...(answer === undefined ? {} : { answer }), ...extra });

describe('answerIndex', () => {
  it.each([[0, 0], [2, 2], ['1', 1], [' 2 ', 2], ['A', 0], ['c', 2], ['option B', 1], ['B)', 1], ['Declining balance', 1], ['straight line', 0]])('%j names option %d', (raw, i) => {
    expect(answerIndex(raw, opts)).toBe(i);
  });
  it.each([undefined, null, '', '  ', false, true, [], {}, 1.5, -1, 3, '3', 'D', 'E', 'None of these', Number.NaN, '1.5'])('%j names no option (never A)', (raw) => {
    expect(answerIndex(raw, opts)).toBeUndefined();
  });
  it('refuses a key that matches the text of two options', () => {
    expect(answerIndex('same', ['same', 'Same', 'other'])).toBeUndefined();
  });
  it('maps True and False to their options for true/false questions', () => {
    expect(answerIndex('False', ['True', 'False'])).toBe(1);
  });
});

describe('a quiz with a missing or invalid answer key', () => {
  it('does not turn a missing key into option A', () => {
    const parsed = parseContent('quiz', quizJson([q(1, 1), q(2, 2), q(3, 0), q(4, 1), q(5, 2), q(6, 1), q(7, 0), q(8, 2), q(9, 1), q(10)]));
    expect(parsed?.kind).toBe('quiz');
    const questions = (parsed as any).questions;
    expect(questions).toHaveLength(9); // the 10th had no key and is gone, not "A"
    expect(questions.map((x: any) => x.q)).not.toContain('Question number 10?');
  });

  it.each([null, '', false, [], 'maybe', 7, -1, 1.5])('drops a question whose key is %j', (bad) => {
    const parsed = parseContent('quiz', quizJson([q(1, 1), q(2, 2), q(3, 0), q(4, 1), q(5, 2), q(6, 1), q(7, 0), q(8, 1), q(9, 2), q(10, bad)])) as any;
    expect(parsed.questions.map((x: any) => x.q)).not.toContain('Question number 10?');
  });

  it('accepts letters and option text as keys and keeps the right answer', () => {
    const parsed = parseContent('quiz', quizJson([q(1, 'B'), q(2, 'Units of production'), q(3, '0')])) as any;
    expect(parsed.questions.map((x: any) => x.answer)).toEqual([1, 2, 0]);
  });

  it('asks again (returns null) when many questions lost their keys, rather than trusting the rest', () => {
    expect(parseContent('quiz', quizJson([q(1, 1), q(2), q(3), q(4, 0)]))).toBeNull();
    expect(parseContent('quiz', quizJson([q(1), q(2), q(3)]))).toBeNull();
  });

  it('asks again when fewer than two usable questions remain', () => {
    expect(parseContent('quiz', quizJson([q(1, 1), q(2)]))).toBeNull();
  });

  it('applies to every question-style format', () => {
    for (const format of ['fill', 'truefalse', 'scenario', 'predict'] as const) {
      expect(parseContent(format, quizJson([q(1), q(2), q(3)]))).toBeNull();
    }
    expect(parseContent('reading', JSON.stringify({ passage: 'A passage.', questions: [q(1), q(2), q(3)] }))).toBeNull();
  });
});
