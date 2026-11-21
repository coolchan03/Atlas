import { confidenceOf, sampleNote } from '../../../src/learning/confidence';

describe('UX-06 confidence states', () => {
  it('a candidate is never shown as verified, even with passages', () => {
    expect(confidenceOf({ status: 'candidate', sourcePassages: 3, citations: 3 }).state).toBe('source-backed');
    expect(confidenceOf({ status: 'candidate', sourcePassages: 3, citations: 3 }).label).toMatch(/not reviewed/);
    expect(confidenceOf({ status: 'candidate', sourcePassages: 0, citations: 2 }).state).toBe('no-evidence');
    expect(confidenceOf({ status: 'candidate', sourcePassages: 0, citations: 0 }).detail).toMatch(/No source/);
  });
  it('only the person\'s review gives verified; disputed and retired claims are labelled as such', () => {
    expect(confidenceOf({ status: 'verified', sourcePassages: 1, citations: 1 }).label).toMatch(/Verified by you/);
    expect(confidenceOf({ status: 'disputed', sourcePassages: 1, citations: 1 }).state).toBe('conflicting');
    expect(confidenceOf({ status: 'rejected', sourcePassages: 1, citations: 1 }).state).toBe('retired');
  });
  it('warns when a benchmark is too small to show improvement', () => {
    expect(sampleNote(5)).toMatch(/too few/);
    expect(sampleNote(20)).toBeNull();
  });
});
