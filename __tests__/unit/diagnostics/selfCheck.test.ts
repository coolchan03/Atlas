import { runChecks, summarize, type Check } from '../../../src/diagnostics/selfCheck';

const ok = (id: string): Check => ({ id, name: id, run: async () => ({ status: 'pass', detail: 'fine' }) });

describe('the self-check runner', () => {
  it('runs every check in order, and a check that throws or hangs fails with its reason without hiding the rest', async () => {
    const checks: Check[] = [
      ok('a'),
      { id: 'b', name: 'b', run: async () => { throw new Error('the model is not loaded'); } },
      { id: 'c', name: 'c', run: () => new Promise(() => undefined) }, // never answers
      { id: 'd', name: 'd', run: async () => ({ status: 'skip', detail: 'off-grid' }) },
    ];
    const seen: string[] = [];
    const results = await runChecks(checks, (r) => seen.push(r.id), 50);
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(results.map((r) => r.status)).toEqual(['pass', 'fail', 'fail', 'skip']);
    expect(results[1].detail).toBe('the model is not loaded');
    expect(results[2].detail).toMatch(/no answer after/);
    expect(summarize(results)).toBe('2 failed, 1 passed, 1 skipped.');
    expect(summarize([results[0], results[3]])).toMatch(/^All good: 1 passed, 1 skipped/);
  });
});
