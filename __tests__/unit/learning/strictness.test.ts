import { assessReport } from '../../../src/learning/evidenceGate';
import { rejectionKind, rejectionStands, reportRubric, questionRubric } from '../../../src/learning/strictness';

const sources = [{ n: 1, title: 'Tax guide', kind: 'web', passage: 'The standard deduction for a single filer is a fixed amount set each year by the IRS.' }, { n: 2, title: 'Other', kind: 'web', passage: 'Capital gains held more than a year are long term.' }];
const report = 'ANSWER: The standard deduction for a single filer is set each year by the IRS [1]. Gains held over a year are long term [2]. Filers can also deduct unicorn feeds totalling 4500 dollars [1] [7].\nREASONING: see sources.';
const line = '1: PASS 4/10 - mostly fine';

it('the same report is failed by Strict and passed by Lenient (one loose sentence and a bad citation number do not sink it)', () => {
  const strict = assessReport({ text: report, sources, judgeLine: line, judgePass: true, strictness: 'strict' });
  const lenient = assessReport({ text: report, sources, judgeLine: line, judgePass: true, strictness: 'lenient' });
  expect(strict.status).toBe('disputed');
  expect(lenient.status).toBe('candidate');
});

it('a judge that says FAIL is still a fail at every level, and a clear known error still disputes a lenient pass', () => {
  expect(assessReport({ text: report, sources, judgeLine: '1: FAIL 2/10 - wrong', judgePass: false, strictness: 'lenient' }).status).toBe('rejected');
  const alarm = 'ANSWER: Above-the-line deductions increase AGI [1].';
  expect(assessReport({ text: alarm, sources, judgeLine: '1: PASS 8/10 - ok', judgePass: true, strictness: 'lenient' }).status).toBe('disputed');
});

it('lenient keeps only clear rejections of questions; strict keeps all; balanced allows vague rejections for under half the bank', () => {
  expect(rejectionKind('too vague, not specific')).toBe('vague');
  expect(rejectionKind('duplicate of question 2')).toBe('duplicate');
  expect(rejectionKind('off topic')).toBe('off-task');
  expect(rejectionStands('lenient', 'too vague', { vagueSoFar: 0, size: 8 })).toBe(false);
  expect(rejectionStands('lenient', 'duplicate of 2', { vagueSoFar: 0, size: 8 })).toBe(true);
  expect(rejectionStands('strict', 'too vague', { vagueSoFar: 0, size: 8 })).toBe(true);
  expect(rejectionStands('balanced', 'too vague', { vagueSoFar: 3, size: 8 })).toBe(true);
  expect(rejectionStands('balanced', 'too vague', { vagueSoFar: 4, size: 8 })).toBe(false);
});

it('the instructions to the judge change with the level', () => {
  expect(reportRubric('strict')).toContain('strict but fair');
  expect(reportRubric('lenient')).toContain('If you are unsure, PASS');
  expect(questionRubric('lenient')).toContain('Approve every question that is about the task');
  expect(questionRubric('strict')).toContain('too vague');
});
