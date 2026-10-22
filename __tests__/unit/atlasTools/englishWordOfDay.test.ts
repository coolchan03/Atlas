import { englishWordOfDay } from '../../../src/atlasTools/englishWordOfDay';

describe('English Word of the Day in Daily News', () => {
  it('always returns an English word with an explanation and an example', () => {
    const word = englishWordOfDay(new Date(2026, 9, 22));
    expect(word.word).toMatch(/^[a-z]+$/);
    expect(word.part).toMatch(/^(noun|adjective|verb)$/);
    expect(word.meaning.length).toBeGreaterThan(12);
    expect(word.example.toLowerCase()).toContain(word.word.toLowerCase().slice(0, 4));
  });
  it('uses a stable local date, not the current time of day', () => {
    expect(englishWordOfDay(new Date(2026, 9, 22, 2, 5)))
      .toEqual(englishWordOfDay(new Date(2026, 9, 22, 23, 59)));
  });
  it('rotates the vocabulary across days', () => {
    const a = englishWordOfDay(new Date(2026, 9, 22));
    const b = englishWordOfDay(new Date(2026, 9, 23));
    expect(a.word).not.toBe(b.word);
  });
});
