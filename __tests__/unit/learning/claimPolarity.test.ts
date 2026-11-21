/**
 * A recalled answer or a new claim that says the OPPOSITE of what is known is not a match, however many words they share.
 * Covers negation, opposite words, conditions, units, signed figures, and contradictions of long claims.
 */
import { numbersIn, opposes, unitConflict, recallScore, conflictReason, compareClaim } from '../../../src/learning/claimText';

describe('numbersIn keeps the sign of a figure', () => {
  it.each([
    ['a loss of -5000 dollars', ['-5000']],
    ['net income was $-1,200', ['-1200']],
    ['net income was -$1,200', ['-1200']],
    ['a balance of −5%', ['-5']],
    ['a loss of ($1,200)', ['-1200']],
    ['cash flow (1,200.50)', ['-1200.5']],
    ['a gain of 5000', ['5000']],
    ['the range 5-10 pages', ['5', '10']],
    ['dated 2024-05-01', ['2024', '5', '1']],
    ['under clause (2) of section 3', ['2', '3']],
    ['Q3-2024 results', ['3', '2024']],
    ['zero is -0', ['0']],
    ['a result of negative 5000', ['-5000']],
    ['a result of minus $5,000', ['-5000']],
  ])('%s', (text, expected) => { expect(numbersIn(text)).toEqual(expected); });

  it('treats a negative figure and the same figure unsigned as different facts', () => {
    expect(numbersIn('-5000')).not.toEqual(numbersIn('5000'));
  });
});

describe('opposes', () => {
  it.each([
    ['The company can deduct the cost.', 'The company cannot deduct the cost.'],
    ['The balance increased last year.', 'The balance decreased last year.'],
    ['Report a gain on the sale.', 'Report a loss on the sale.'],
    ['Stay at least 61 days.', 'Stay at most 61 days.'],
    ['The entry is a debit to cash.', 'The entry is a credit to cash.'],
    ['The expense is deductible.', 'The expense is not deductible.'],
    ['The statement is true.', 'The statement is false.'],
  ])('%s  vs  %s', (a, b) => { expect(opposes(a, b)).toBe(true); expect(opposes(b, a)).toBe(true); });

  it.each([
    ['The expense is not required.', 'The expense is optional.'],
    ['The balance did not decrease.', 'The balance increased.'],
    ['The treaty was signed in 1990.', 'In 1990 the treaty was signed.'],
    ['It is not deductible.', 'It is not deductible at all.'],
  ])('agrees: %s  vs  %s', (a, b) => { expect(opposes(a, b)).toBe(false); });
});

describe('unitConflict', () => {
  it('flags the same number in a different unit', () => {
    expect(unitConflict('The limit is 5 km.', 'The limit is 5 miles.')).toBe(true);
    expect(unitConflict('Rates rose 5 percent.', 'Rates rose 5 dollars.')).toBe(true);
  });
  it('accepts the same unit written differently, or no unit', () => {
    expect(unitConflict('The limit is 5 miles.', 'The limit is 5 mile.')).toBe(false);
    expect(unitConflict('Rates rose 5 percent.', 'Rates rose 5%.')).toBe(false);
    expect(unitConflict('The limit is 5 km.', 'The limit is 5.')).toBe(false);
  });
});

describe('recallScore does not reward a contradicting answer', () => {
  const claims = ['The Treaty of Westphalia was signed in 1648 and ended the Thirty Years War.'];
  it('full credit for the claim in other words', () => {
    expect(recallScore('Westphalia ended the Thirty Years War; the treaty was signed in 1648.', claims)).toBe(1);
  });
  it('no credit when the answer negates it, though almost every word matches', () => {
    expect(recallScore('The Treaty of Westphalia was not signed in 1648 and did not end the Thirty Years War.', claims)).toBe(0);
  });
  it('no credit for the opposite direction', () => {
    const c = ['Interest rates rose by 5 percent during the period under review.'];
    expect(recallScore('Interest rates fell by 5 percent during the period under review.', c)).toBe(0);
    expect(recallScore('Interest rates rose by 5 percent during the period under review.', c)).toBe(1);
  });
  it('no credit for a loss given where the key says gain', () => {
    const c = ['The sale produced a gain of 4000 dollars for the seller.'];
    expect(recallScore('The sale produced a loss of 4000 dollars for the seller.', c)).toBe(0);
  });
  it('no credit for a negative figure given for a positive one', () => {
    const c = ['The account closed the year with a balance of 1200 dollars on the ledger.'];
    expect(recallScore('The account closed the year with a balance of -1200 dollars on the ledger.', c)).toBe(0);
  });
  it('no credit for the right number in the wrong unit', () => {
    const c = ['The vehicle travelled a distance of 12 miles along the coast road.'];
    expect(recallScore('The vehicle travelled a distance of 12 km along the coast road.', c)).toBe(0);
  });
  it('only half credit when a condition or exception is dropped', () => {
    const c = ['The deduction applies unless the taxpayer already claimed the credit elsewhere.'];
    expect(recallScore('The deduction applies, the taxpayer claimed the credit elsewhere.', c)).toBeLessThanOrEqual(0.5);
    expect(recallScore('The deduction applies unless the taxpayer already claimed the credit elsewhere.', c)).toBe(1);
  });
  it('checks the sentence about the claim, not a negation somewhere else in the answer', () => {
    const answer = 'The treaty was signed in 1648 and ended the Thirty Years War. I am not sure about anything else here.';
    expect(recallScore(answer, claims)).toBe(1);
  });
});

describe('long claims with opposite meanings are conflicts, never duplicates', () => {
  const longYes = 'A taxpayer who maintains a qualifying home office used regularly and exclusively as the principal place of business for the trade can deduct a proportionate share of rent, utilities and insurance for the tax year in question.';
  const longNo = longYes.replace('can deduct', 'cannot deduct');
  it('is longer than the old 160 character cap', () => { expect(longYes.length).toBeGreaterThan(200); });
  it('flags the opposite of a long claim', () => {
    expect(conflictReason(longYes, longNo)).toMatch(/opposite/);
    expect(compareClaim(longNo, [{ id: 'k1', text: longYes }])).toMatchObject({ relation: 'contradicts', matchId: 'k1' });
  });
  it('flags opposite words as well as "not"', () => {
    const up = 'Over the review period the central bank policy rate increased and the committee confirmed the stance for all remaining quarters of the fiscal year ahead.';
    expect(compareClaim(up.replace('increased', 'decreased'), [{ id: 'k', text: up }]).relation).toBe('contradicts');
  });
  it('still calls a true repeat a duplicate', () => {
    expect(compareClaim(longYes, [{ id: 'k1', text: longYes }]).relation).toBe('duplicate');
  });
  it('does not call a short claim inside a long one a conflict', () => {
    expect(conflictReason('A taxpayer can deduct rent.', `${longNo} Separately, a taxpayer can deduct rent only with records.`)).toBeUndefined();
  });
  it('finds a contradiction even when a different known claim is the closer match', () => {
    const near = `${longYes} (This repeats the earlier note.)`; // nearly identical to the new claim, but agrees with it
    const known = [{ id: 'near', text: `${longNo.replace('cannot', 'can')} Also noted twice.` }, { id: 'opp', text: longNo }];
    const result = compareClaim(near, known);
    expect(result.relation).toBe('contradicts');
    expect(result.matchId).toBe('opp');
  });
  it('different years are still different versions of a rule, not a conflict', () => {
    expect(conflictReason('For 2023 the standard deduction is not available to dependents.', 'For 2024 the standard deduction is available to dependents.')).toBeUndefined();
  });
  it('a different number is still a conflict', () => {
    expect(conflictReason('The standard deduction for a single filer is $13,850.', 'The standard deduction for a single filer is $14,600.')).toMatch(/different numbers/);
  });
});
