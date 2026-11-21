import { assessReport, citedNumbers, parseJudgeScore, taxErrorSignals } from '../../../src/learning/evidenceGate';

const source = [{ n: 1, title: 'Section 199A', kind: 'statute', passage: 'The rule exists in the code. Qualified business income, deduction and AGI rules apply.', locator: '26 USC 199A' }];

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

describe('facts and citations are gates of their own', () => {
  const line = (verdict: string, dims = '') => `1: ${verdict}${dims ? ` | ${dims}` : ''} - because`;
  const ok = { text: 'ANSWER: The rule exists in the code. [1]', sources: source, judgePass: true as boolean | null };

  it('reads the six dimension scores and ignores impossible ones', () => {
    const r = assessReport({ ...ok, judgeLine: line('PASS 9/10', 'FACTS 8 | CITES 7 | COMPLETE 6 | RELEVANT 9 | LOGIC 8 | CLEAR 99') });
    expect(r.dimensions).toEqual({ facts: 8, cites: 7, complete: 6, relevant: 9, logic: 8 });
    expect(r.gates).toEqual({ facts: 'pass', citations: 'pass' });
    expect(r.status).toBe('candidate');
  });

  it('a perfect overall score cannot override a failed factual gate', () => {
    const r = assessReport({ ...ok, judgeLine: line('PASS 10/10', 'FACTS 3 | CITES 9 | CLEAR 10') });
    expect(r.gates.facts).toBe('fail');
    expect(r.status).toBe('disputed');
    expect(r.reasons.join(' ')).toContain('factual correctness 3/10');
  });

  it('a perfect overall score cannot override a failed citation gate', () => {
    const r = assessReport({ ...ok, judgeLine: line('PASS 10/10', 'FACTS 9 | CITES 2') });
    expect(r.gates.citations).toBe('fail');
    expect(r.status).toBe('disputed');
  });

  it('checks the cited passage itself, whatever the judge says', () => {
    const wrong = assessReport({ ...ok, text: 'ANSWER: The limit is 168600 dollars. [1]', judgeLine: line('PASS 9/10', 'FACTS 9 | CITES 9') });
    expect(wrong.gates.citations).toBe('fail');
    expect(wrong.status).toBe('disputed');
    expect(wrong.reasons.join(' ')).toContain('168600');
  });

  it('treats missing dimension scores as unknown, never as a pass', () => {
    const r = assessReport({ ...ok, judgeLine: line('PASS 8/10') });
    expect(r.gates.facts).toBe('unknown');
    expect(r.status).toBe('candidate');
  });

  it('disputes a verdict that contradicts its own score, and rejects a FAIL', () => {
    expect(assessReport({ ...ok, judgeLine: line('PASS 2/10', 'FACTS 8 | CITES 8') }).status).toBe('disputed');
    expect(assessReport({ ...ok, judgePass: false, judgeLine: line('FAIL 3/10') }).status).toBe('rejected');
  });
});
