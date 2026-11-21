/** Claims for different years: a question that names a year gets that year's claims, and claims for other years are set aside. */
import { yearsOf } from '../../../src/learning/claimText';

describe('years in text', () => {
  it('finds the years a text names', () => {
    expect(yearsOf('For 2023 the limit is 22,500, up from 2022.')).toEqual([2022, 2023]);
    expect(yearsOf('The limit is 22,500 and 12345 units')).toEqual([]);
  });
});

describe('learned claims for a year', () => {
  function load(claims: Array<{ id: string; text: string; status: string }>) {
    jest.resetModules();
    const { useLearningStore } = require('../../../src/learning/store');
    useLearningStore.setState({ config: { a: { topic: 'tax' } } });
    const { learningKnowledgeDb } = require('../../../src/learning/knowledgeDb');
    jest.spyOn(learningKnowledgeDb, 'knownClaims').mockReturnValue(claims);
    jest.spyOn(learningKnowledgeDb, 'getClaimSources').mockReturnValue([]);
    return require('../../../src/learning/askLearned');
  }
  const claims = [
    { id: '1', text: 'The standard deduction for a single filer in 2023 is 13850 dollars.', status: 'candidate' },
    { id: '2', text: 'The standard deduction for a single filer in 2024 is 14600 dollars.', status: 'candidate' },
  ];

  it('puts the asked year first and sets the other year aside', () => {
    const { relevantClaims } = load(claims);
    const hits = relevantClaims('What is the standard deduction for a single filer in 2024?');
    expect(hits[0].id).toBe('2');
    expect(hits[0].years).toEqual([2024]);
    expect(hits.find((h: { id: string }) => h.id === '1')?.score ?? 0).toBeLessThan(hits[0].score);
  });

  it('marks each claim with its year and warns when the answers span years, when no year was asked', async () => {
    const { askLearned } = load(claims);
    const out = await askLearned('What is the standard deduction for a single filer?');
    expect(out).toContain('year 2023');
    expect(out).toContain('year 2024');
    expect(out).toContain('These claims are for different years');
  });
});
