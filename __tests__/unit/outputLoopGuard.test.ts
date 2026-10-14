import { OutputLoopGuard } from '../../src/services/outputLoopGuard';

describe('output loop detection across native token boundaries', () => {
  it('catches a runaway at-sign loop without waiting for the output limit', () => {
    const detector = new OutputLoopGuard();
    for (let i = 0; i < 47; i++) expect(detector.observe('@')).toBeNull();
    expect(detector.observe('@')).toBe('repeated-character');
    expect(detector.tripped).toBe(true);
  });
  it('does not flag normal email, decorators, math or markdown code blocks', () => {
    const detector = new OutputLoopGuard();
    const sample = 'Contact alex@example.com.\n@@decorator\n# Heading\n' +
      '```python\n@route("/")\ndef hello():\n  return 2 ** 16\n```\n';
    for (const ch of sample) expect(detector.observe(ch)).toBeNull();
  });
  it('catches a multi-character repeated sentence split across tokens', () => {
    const detector = new OutputLoopGuard();
    let signal: string | null = null;
    for (let i = 0; i < 70; i++) {
      signal = detector.observe(i % 2 === 0 ? 'fish ' : 'fish ');
      if (signal) break;
    }
    expect(signal).toBe('repeated-pattern');
  });
  it('does not classify repeated words in short user-facing responses as a loop', () => {
    const detector = new OutputLoopGuard();
    expect(detector.observe('No no no! I can help with that.')).toBeNull();
  });
  it('keeps bounded output state after long non-repeating streams', () => {
    const detector = new OutputLoopGuard();
    for (let i = 0; i < 2000; i++) expect(detector.observe(`item-${i} is distinct.\n`)).toBeNull();
    expect(detector.tripped).toBe(false);
  });
  it('detects continued loops without resetting when a separate chat starts', () => {
    const first = new OutputLoopGuard();
    expect(first.observe('@'.repeat(48))).toBe('repeated-character');
    const second = new OutputLoopGuard();
    expect(second.observe('A fresh chat can answer normally.')).toBeNull();
  });
});
