import { speechSpan } from '../../src/atlasVoice/podcastAudio';

describe('trimming the silence around a rendered line', () => {
  it('starts just before the speech and stops just after it', () => {
    const rate = 1000;
    const samples = [...Array(300).fill(0), ...Array(400).fill(0.3), ...Array(500).fill(0.001)];
    const { offset, duration } = speechSpan(samples, rate);
    expect(offset).toBeCloseTo(0.18, 2);
    expect(offset + duration).toBeCloseTo(0.78, 2);
  });
  it('keeps the soft fade-in of an opening vowel (it starts well before the first loud sample)', () => {
    const rate = 1000;
    const ramp = Array.from({ length: 80 }, (_, i) => 0.3 * (i / 80)); // 80 ms fade-in
    const samples = [...Array(300).fill(0), ...ramp, ...Array(300).fill(0.3), ...Array(200).fill(0)];
    const { offset } = speechSpan(samples, rate);
    const firstAudible = 300 + ramp.findIndex((v) => v >= 0.01);
    expect(offset * rate).toBeLessThan(firstAudible - 100); // at least 100 ms of lead before the first audible sample
  });
  it('plays a silent file whole', () => {
    expect(speechSpan(Array(500).fill(0), 1000)).toEqual({ offset: 0, duration: 0.5 });
  });
});
