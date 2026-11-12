import { mayRewrite, sameEvidence } from '../../../src/learning/cycleRules';
import type { LearnReport } from '../../../src/learning/store';

const src = (n: number, title: string, passage: string) => ({ n, title, kind: 'library' as const, passage });
const report = (over: Partial<LearnReport>): LearnReport => ({ id: 'r', itemId: 'i', q: 'q', text: 't', sources: '', at: 1, status: 'fail', ...over });

describe('rewriting a report only when it can improve', () => {
  const same = [src(1, 'Manual', 'Boil water for one minute.')];

  it('recognises the same evidence even when the numbering or spacing differs', () => {
    expect(sameEvidence(same, [src(7, 'manual', 'Boil  water for one minute.')])).toBe(true);
    expect(sameEvidence(same, [src(1, 'Manual', 'Boil water for one minute.'), src(2, 'New', 'Fresh passage.')])).toBe(false);
    expect(sameEvidence(undefined, same)).toBe(false);
  });

  it('refuses a rewrite that failed on facts or citations when the search found nothing new', () => {
    const failed = report({ sourceList: same, gates: { facts: 'fail', citations: 'pass' } });
    expect(mayRewrite(failed, same).ok).toBe(false);
    expect(mayRewrite(failed, [src(2, 'New', 'Different passage.')]).ok).toBe(true);
  });

  it('allows a rewrite that only needs better writing', () => {
    expect(mayRewrite(report({ sourceList: same, gates: { facts: 'pass', citations: 'pass' } }), same).ok).toBe(true);
    expect(mayRewrite(undefined, same).ok).toBe(true);
  });
});
