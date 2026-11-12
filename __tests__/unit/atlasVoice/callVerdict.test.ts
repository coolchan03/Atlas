import { callVerdict } from '../../../src/atlasVoice/useVoiceCreation';

describe('what a speed result means for phone calls', () => {
  it('says fast, borderline or too slow', () => {
    expect(callVerdict(0.5)).toMatch(/Fast enough/);
    expect(callVerdict(0.95)).toMatch(/Borderline/);
    expect(callVerdict(1.6)).toMatch(/Too slow/);
  });
});
