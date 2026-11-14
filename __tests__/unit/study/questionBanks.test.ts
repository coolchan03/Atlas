/** A question bank uploaded as a source is recognised by what it is, its answer key is read, and it is asked from, never taught from. */
import { applyAnswerKey, extractQuestions, isQuestionBankText, looksLikeQuestions, parseAnswerKey } from '../../../src/study/bookQuestions';
import { makeSource, relevantExcerpts, sourceQuestions } from '../../../src/topics/sources';

const questions = (n: number, withOptions = true) => Array.from({ length: n }, (_, i) =>
  `${i + 1}. Which of the following describes the lease classification test number ${i + 1} under ASC 842?\n${withOptions ? `A) Finance lease\nB) Operating lease\nC) Short-term lease\nD) None of these\n` : ''}`).join('\n');
const KEY = '\nAnswer key\n1-B 2-A 3. C 4) D 5: B 6-A\n';
const BANK = `${questions(12)}${KEY}`;
const TEXTBOOK = `${Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}: a lessee records a right-of-use asset and a lease liability at the start of the lease, measured at present value.`).join('\n')}\n1. What is a lease liability under the standard?\nAnswer: The present value of the lease payments.`;

describe('recognising a question bank', () => {
  it('is a bank when most of the text is questions, and a textbook with a few end-of-chapter questions is not', () => {
    expect(isQuestionBankText(BANK)).toBe(true);
    expect(isQuestionBankText(TEXTBOOK)).toBe(false);
    expect(isQuestionBankText('Short note.')).toBe(false);
    expect(isQuestionBankText(questions(4))).toBe(false); // too few to call it a bank
  });

  it('treats a passage as questions when it is mostly questions', () => {
    expect(looksLikeQuestions(questions(5))).toBe(true);
    expect(looksLikeQuestions(TEXTBOOK)).toBe(false);
  });
});

describe('the answer key at the end', () => {
  it('reads "1-B 2-A 3. C 4) D 5: B" style keys, and ignores a text with no key or a tiny one', () => {
    const key = parseAnswerKey(BANK);
    expect([...key.entries()].slice(0, 6)).toEqual([[1, 'B'], [2, 'A'], [3, 'C'], [4, 'D'], [5, 'B'], [6, 'A']]);
    expect(parseAnswerKey(questions(12)).size).toBe(0);
    expect(parseAnswerKey('Answers: 1-A 2-B').size).toBe(0);
  });

  it('gives each numbered question its answer, with the option text, and leaves repeated numbers and printed answers alone', () => {
    const bank = extractQuestions(BANK, 'Bank.pdf');
    const filled = applyAnswerKey(bank, parseAnswerKey(BANK));
    expect(filled[0]).toMatchObject({ number: 1, answer: 'Operating lease' });
    expect(filled[2].answer).toBe('Short-term lease');
    expect(filled[8].answer).toBeUndefined(); // 9 is past the key
    const twice = applyAnswerKey([{ question: 'one?', source: 's', number: 1 }, { question: 'again?', source: 's', number: 1 }], parseAnswerKey(BANK));
    expect(twice.every((q) => q.answer === undefined)).toBe(true);
    const printed = applyAnswerKey([{ question: 'x?', source: 's', number: 1, answer: 'mine' }], parseAnswerKey(BANK));
    expect(printed[0].answer).toBe('mine');
  });
});

describe('a question bank as a course source', () => {
  it('is flagged and kept in full, while an ordinary note is cut short', () => {
    const bank = makeSource({ title: 'Bank.pdf', kind: 'file', text: BANK.repeat(20) }, 'a');
    expect(bank.questionBank).toBe(true);
    expect(bank.text.length).toBeGreaterThan(12000);
    const note = makeSource({ title: 'Notes', kind: 'note', text: TEXTBOOK.repeat(20) }, 'b');
    expect(note.questionBank).toBeUndefined();
    expect(note.text.length).toBeLessThanOrEqual(12000);
    expect(makeSource({ title: 'Web', kind: 'web', text: BANK }, 'c').questionBank).toBeUndefined();
  });

  it('gives its questions, with answers from the key, and is never read as a lesson', () => {
    const bank = makeSource({ title: 'Bank.pdf', kind: 'file', text: BANK }, 'a');
    const asked = sourceQuestions([bank, makeSource({ title: 'Notes', kind: 'note', text: TEXTBOOK }, 'b')]);
    expect(asked.length).toBeGreaterThanOrEqual(10);
    expect(asked.find((q) => q.number === 2)?.answer).toBe('Finance lease');
    expect(sourceQuestions(undefined)).toEqual([]);
    const excerpts = relevantExcerpts([bank], 'lease classification test under ASC 842');
    expect(excerpts).toEqual([]);
    expect(relevantExcerpts([makeSource({ title: 'Notes', kind: 'note', text: TEXTBOOK }, 'b')], 'lessee right-of-use asset lease liability').length).toBeGreaterThan(0);
  });
});
