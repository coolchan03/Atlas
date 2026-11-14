import { waveDigest, waveReports, waveTally } from '../../../src/learning/wave';
import { planStep } from '../../../src/learning/cycleRules';

const bank = [{ id: 'a', q: 'Q a', status: 'approved', tries: 0, round: 1 }, { id: 'b', q: 'Q b', status: 'approved', tries: 0, round: 1 }, { id: 'c', q: 'Q c', status: 'approved', tries: 0, round: 2 }] as never[];
const report = (itemId: string, at: number, extra: Record<string, unknown> = {}) => ({ id: `r-${itemId}`, itemId, q: `Question ${itemId}`, text: `ANSWER: Answer for ${itemId} that is quite detailed.`, sources: '', at, status: 'waiting', ...extra }) as never;

describe('a wave of reports', () => {
  it('holds the reports of one round, oldest first', () => {
    const log = [report('c', 3), report('b', 2), report('a', 1)];
    expect(waveReports(log, bank, 1).map((r: any) => r.itemId)).toEqual(['a', 'b']);
    expect(waveReports(undefined, bank, 1)).toEqual([]);
  });

  it('writes one line per report with its verdict, leaving out the ones being judged now', () => {
    const reports = [report('a', 1, { status: 'pass', score: 8, gates: { facts: 'pass', citations: 'fail' } }), report('b', 2, { status: 'fail', verificationStatus: 'disputed' }), report('c', 3)];
    const digest = waveDigest(reports, { exclude: ['c'] });
    expect(digest).toContain('PASS 8/10, facts pass, citations fail');
    expect(digest).toContain('FAIL, disputed');
    expect(digest).not.toContain('Question c');
    expect(waveDigest(reports)).toContain('not judged yet');
    expect(waveDigest(reports)).toContain('says: Answer for a');
    expect(waveDigest([], {})).toBe('');
  });

  it('keeps only the newest lines when a wave is long, and counts passes and fails', () => {
    const many = Array.from({ length: 40 }, (_, i) => report(`x${i}`, i, { status: i % 2 ? 'pass' : 'fail' }));
    expect(waveDigest(many, { max: 5 }).split('\n')).toHaveLength(5);
    expect(waveTally(many)).toEqual({ total: 40, passed: 20, failed: 20, waiting: 0 });
  });
});

describe('a question the person asked', () => {
  it('is studied before everything else', () => {
    const items = [{ id: 'plan', q: 'planned', status: 'approved', tries: 0, round: 1 }, { id: 'mine', q: 'asked', status: 'approved', tries: 0, round: 1, kind: 'asked' }] as never[];
    const step = planStep({ bank: items, pendingItemIds: [], unaskedConflicts: [{ id: 'c', a: { id: 'a', text: 'x' }, b: { id: 'b', text: 'y' }, reason: 'r' }] as never, due: [] });
    expect(step).toMatchObject({ type: 'study', item: { id: 'mine' } });
    expect(planStep({ bank: items, pendingItemIds: ['mine'], unaskedConflicts: [], due: [] })).toMatchObject({ item: { id: 'plan' } });
  });
});
