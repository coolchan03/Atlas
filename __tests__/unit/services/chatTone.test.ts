import { chatToneNote, CHAT_TONES } from '../../../src/services/chatTone';

describe('chat tone presets', () => {
  it('does not override explicit agent style', () => {
    expect(chatToneNote('creative', true)).toBe('');
    expect(chatToneNote('serious', false)).toContain('professional');
  });
  it('keeps balanced optional and provides different modes', () => {
    expect(chatToneNote('balanced')).toBe('');
    expect(new Set(CHAT_TONES.map((x) => x.id)).size).toBe(5);
    expect(chatToneNote('precise')).toContain('uncertainty');
  });
});
