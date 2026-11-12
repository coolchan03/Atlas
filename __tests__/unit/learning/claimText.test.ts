import { checkSupport, claimSentences, closestPassage, compareClaim, numbersIn, rankClaims, recallScore, similarity } from '../../../src/learning/claimText';

describe('comparing claims', () => {
  const known = [
    { id: 'a', text: 'The standard deduction for a single filer in 2024 is 14600 dollars.' },
    { id: 'b', text: 'Boiling water for one minute makes it safe to drink.' },
  ];

  it('calls a restatement a duplicate', () => {
    expect(compareClaim('For 2024 the standard deduction for a single filer is 14,600 dollars.', known)).toMatchObject({ relation: 'duplicate', matchId: 'a' });
  });

  it('flags the same subject with a different number as a contradiction', () => {
    const r = compareClaim('The standard deduction for a single filer in 2024 is 13850 dollars.', known);
    expect(r).toMatchObject({ relation: 'contradicts', matchId: 'a' });
    expect(r.reason).toMatch(/different numbers/);
  });

  it('flags an opposite statement as a contradiction', () => {
    expect(compareClaim('Boiling water for one minute does not make it safe to drink.', known)).toMatchObject({ relation: 'contradicts', matchId: 'b' });
  });

  it('treats an unrelated claim as new', () => {
    expect(compareClaim('Compression depth for adult CPR is about two inches.', known)).toEqual({ relation: 'new' });
  });

  it('measures how alike two claims are', () => {
    expect(similarity('water boils at 100 degrees', 'water boils at 100 degrees celsius')).toBe(1);
    expect(similarity('water boils', 'tax deductions')).toBe(0);
  });
});

describe('does the cited text contain what the claim states', () => {
  it('rejects a claim whose number is not in the passage', () => {
    const r = checkSupport('The limit is 168600 dollars.', ['The limit for the year is 160200 dollars.']);
    expect(r.supported).toBe(false);
    expect(r.missingNumbers).toEqual(['168600']);
  });

  it('accepts a claim whose numbers and words are in the passage', () => {
    expect(checkSupport('The limit is 160,200 dollars.', ['The limit for the year is 160200 dollars.']).supported).toBe(true);
  });

  it('cannot judge with no passage, and does not pretend to', () => {
    expect(checkSupport('Anything at all here.', [])).toEqual({ supported: null, missingNumbers: [], overlap: 0 });
  });

  it('finds the closest passage only when it really shares the words', () => {
    const passages = [{ n: 1, passage: 'Tourniquets stop heavy limb bleeding when pressure fails.' }, { n: 2, passage: 'Unrelated text about maps.' }];
    expect(closestPassage('A tourniquet stops heavy bleeding in a limb.', passages)).toBe(1);
    expect(closestPassage('Quantum chromodynamics describes quarks.', passages)).toBeUndefined();
  });

  it('reads numbers with commas and decimals the same way', () => {
    expect(numbersIn('Pay 1,200 or 1200.50 by 2025')).toEqual(['1200', '1200.5', '2025']);
    expect(numbersIn('Boil for one minute or ten minutes, not one of them')).toEqual(['1', '10']);
  });
});

describe('splitting a report into claims', () => {
  it('uses the answer, drops the reasoning and unsure parts, and removes repeats', () => {
    const report = 'ANSWER: Boil water for one minute. Let it cool before drinking it. Boil water for one minute.\nKEY POINTS:\n- Use a clean pot for boiling.\nREASONING: This is long reasoning that should not become a claim.\nUNSURE: none';
    expect(claimSentences(report)).toEqual(['Boil water for one minute.', 'Let it cool before drinking it.', 'Use a clean pot for boiling.']);
  });

  it('keeps each citation marker with its sentence', () => {
    expect(claimSentences('ANSWER: Boil the water for one minute. [1] Let it cool before drinking it. [2][3]')).toEqual([
      'Boil the water for one minute. [1]', 'Let it cool before drinking it. [2][3]',
    ]);
  });
});

describe('practice scoring without a model', () => {
  const stored = ['Boil water for one minute to make it safe.', 'Let boiled water cool before drinking it.'];

  it('scores how much of what was learned an answer contains', () => {
    expect(recallScore('You should boil the water for one minute to make it safe, then let it cool before drinking.', stored)).toBe(1);
    expect(recallScore('Boil water for one minute to make it safe.', stored)).toBe(0.5);
    expect(recallScore('Boil water for ten minutes.', stored)).toBe(0);
    expect(recallScore('anything', [])).toBe(0);
  });

  it('retrieves the closest stored claims for a question', () => {
    const known = [{ id: '1', text: stored[0] }, { id: '2', text: 'Tourniquets stop heavy bleeding.' }];
    expect(rankClaims('How long to boil water?', known).map((k) => k.id)).toEqual(['1']);
  });
});
