import { gateFromScore, parseDimensions, plainReason, verdictMatchesScore } from '../../../src/learning/judgeDimensions';

describe('judge dimension scores', () => {
  it('reads scores written in different ways', () => {
    expect(parseDimensions('FACTUAL: 7/10, citations 8, Logic=9')).toEqual({ facts: 7, cites: 8, logic: 9 });
  });

  it('gates need a real score: missing means unknown', () => {
    expect([gateFromScore(9), gateFromScore(5.9), gateFromScore(undefined)]).toEqual(['pass', 'fail', 'unknown']);
  });

  it('keeps the verdict and the score consistent', () => {
    expect([verdictMatchesScore(8, true), verdictMatchesScore(3, true), verdictMatchesScore(3, false), verdictMatchesScore(9, false)]).toEqual([true, false, true, false]);
  });

  it('shows the reason without the marks', () => {
    expect(plainReason('8/10 | FACTS 8 | CITES 7 - Matches the manual')).toBe('Matches the manual');
  });
});
