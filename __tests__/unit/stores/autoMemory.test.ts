import { extractMemoryCandidate } from '../../../src/stores/autoMemory';

describe('consent-gated auto-memory extraction', () => {
  it('recognizes explicit stable preferences only', () => {
    expect(extractMemoryCandidate('I prefer learning with practice questions.')).toEqual({ fact: 'I prefer learning with practice questions.', category: 'preferences' });
    expect(extractMemoryCandidate('Can you explain a tax law?')).toBeNull();
  });
  it('never classifies mental health facts as safe to auto-save', () => {
    expect(extractMemoryCandidate('I like talking about my depression in therapy.')?.category).toBe('therapy');
    expect(extractMemoryCandidate('My goal is to process grief at my own pace.')?.category).toBe('therapy');
    expect(extractMemoryCandidate('I want to work on grief.')?.category).toBe('therapy');
  });
});
