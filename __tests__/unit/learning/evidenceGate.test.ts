import { assessReport, citedNumbers, parseJudgeScore, taxErrorSignals } from '../../../src/learning/evidenceGate';

const source = [{ n: 1, title: 'Section 199A', kind: 'statute', passage: 'Original legislative passage', locator: '26 USC 199A' }];

describe('independent evidence gate', () => {
  test.each(['8/5', '7/8', '11/10'])('invalid judge score %s cannot grant acceptance', (score) => {
    expect(parseJudgeScore(`1: PASS ${score}`)).toMatchObject({ valid: false });
  });

  it('distinguishes a valid judge score from factual verification', () => {
    const r = assessReport({ text: 'ANSWER: The rule exists [1].', sources: source, judgeLine: '1: PASS 10/10', judgePass: true });
    expect(r.judgeScore).toBe(10);
    expect(r.status).toBe('candidate');
    expect(r.citationMappingsValid).toBe(true);
  });

  it('does not trust unsupported or nonexistent citation numbers', () => {
    const r = assessReport({ text: 'ANSWER: The claim is true [4].', sources: source, judgeLine: '1: PASS 10/10', judgePass: true });
    expect(r.citationMappingsValid).toBe(false);
    expect(r.status).not.toBe('verified');
    expect(r.reasons.join(' ')).toContain('Unknown citation numbers');
  });

  it('deduplicates repeated citation references', () => {
    expect(citedNumbers('A [1] then [1] and [2].')).toEqual([1, 2]);
  });

  test.each([
    'ANSWER: Above-the-line deductions increase AGI [1].',
    'ANSWER: Section 199A QBI is an itemized deduction [1].',
    'ANSWER: Community-property allocation doubles taxable income [1].',
    'ANSWER: Net Investment Income Tax is FICA based on wages [1].',
  ])('flags a material tax error before acceptance: %s', (text) => {
    expect(assessReport({ text, sources: source, judgeLine: '1: PASS 10/10', judgePass: true }).status).toBe('disputed');
  });

  it('does not flag an explicit correction as the error itself', () => {
    expect(taxErrorSignals('ANSWER: QBI is not an itemized deduction. [1]')).toEqual([]);
  });
});
