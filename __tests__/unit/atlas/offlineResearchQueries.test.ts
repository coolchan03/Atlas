import { subQueries } from '../../../src/services/offlineProjectResearch';

describe('offline Deep Research sub-queries', () => {
  it('splits the key words of a long question into two narrower searches', () => {
    expect(subQueries('How does photosynthesis convert sunlight into chemical energy in plant cells?'))
      .toEqual(['photosynthesis convert sunlight chemical', 'energy plant cells']);
  });
  it('adds nothing for short questions', () => {
    expect(subQueries('What is DNA?')).toEqual([]);
  });
});
