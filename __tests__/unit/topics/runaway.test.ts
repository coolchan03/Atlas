import { isLooping, maxCharsFor, repairCutJson, runawayReason } from '../../../src/topics/runaway';
import { parseContent } from '../../../src/topics/formats';

describe('a model that does not stop', () => {
  it('is cut when the reply is far longer than any lesson, or goes round in a loop, and not before', () => {
    const varied = (n: number) => Array.from({ length: 400 }, (_, i) => `point ${i} about topic ${i * 7}`).join('. ').slice(0, n);
    expect(runawayReason(varied(5000), maxCharsFor('lesson'))).toBeNull();
    expect(runawayReason(varied(9600), maxCharsFor('lesson'))).toMatch(/ran past/);
    expect(maxCharsFor('quiz')).toBeLessThan(maxCharsFor('lesson'));
    const loop = `Intro. ${'The lease liability is the present value of the payments. '.repeat(12)}`;
    expect(isLooping(loop)).toBe(true);
    expect(isLooping('A varied text. '.repeat(5) + Array.from({ length: 40 }, (_, i) => `sentence number ${i} says something new`).join('. '))).toBe(false);
  });

  it('keeps the finished sections of a lesson that was cut off, and leaves out the one that was half written', () => {
    const cut = '{"sections": [{"heading": "Cash", "text": "Cash is money in hand and in the bank."}, {"heading": "Debts", "text": "Debts are what is owed to other people and firms."}, {"heading": "Leases", "text": "A lease is a contract that lets one pa';
    const fixed = repairCutJson(cut);
    expect(fixed).not.toBe('');
    const lesson: any = parseContent('lesson', fixed);
    expect(lesson.sections.map((s: any) => s.heading)).toEqual(['Cash', 'Debts']);
    expect(JSON.stringify(lesson)).not.toContain('lets one pa');
  });

  it('gives nothing when there is nothing to save', () => {
    expect(repairCutJson('no json here')).toBe('');
    expect(repairCutJson('{"sections": [{"heading": "Cas')).toBe('');
  });
});
