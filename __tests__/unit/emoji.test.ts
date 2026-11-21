import { stripEmoji } from '../../src/utils/emoji';

describe('no emoji in a phone call', () => {
  it('takes out emojis, joined emojis, flags and emoticons, and keeps the words and numbers', () => {
    expect(stripEmoji('Sure thing 😀! I can help 👍🏽 today.')).toBe('Sure thing! I can help today.');
    expect(stripEmoji('Family 👨‍👩‍👧 flag 🇬🇧 star ⭐ heart ❤️ done')).toBe('Family flag star heart done');
    expect(stripEmoji('Okay :) see you ;-) later :D')).toBe('Okay see you later ');
    expect(stripEmoji('It costs $5 (about 4.50) at 8:30, ok? Yes: 8) is fine')).toContain('It costs $5 (about 4.50) at 8:30, ok?');
    expect(stripEmoji('Plain words only.')).toBe('Plain words only.');
    expect(stripEmoji('')).toBe('');
  });
});
