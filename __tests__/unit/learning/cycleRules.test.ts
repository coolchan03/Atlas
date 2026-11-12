import { mayRewrite, onTask, planStep, pruneBank, resolveQuestion, sameEvidence } from '../../../src/learning/cycleRules';
import type { BankItem, LearnReport } from '../../../src/learning/store';

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

describe('what the cycle does next', () => {
  const item = (id: string, status: BankItem['status'] = 'approved'): BankItem => ({ id, q: `Question ${id}`, status, tries: 0, round: 1 });
  const conflict = { id: 'k', reason: 'different numbers', a: { id: 'a', text: 'Boil one minute.' }, b: { id: 'b', text: 'Boil ten minutes.' } };
  const due = [{ id: 'c', question: 'Old question', topic: 't', strength: 0.2 }];

  it('settles conflicts first, then reviews, then new study in the plan order', () => {
    const base = { bank: [item('1'), item('2')], pendingItemIds: [] as string[], unaskedConflicts: [conflict], due };
    expect(planStep(base)).toMatchObject({ type: 'resolve' });
    expect(planStep({ ...base, unaskedConflicts: [] })).toMatchObject({ type: 'practice' });
    expect(planStep({ ...base, unaskedConflicts: [], due: [] })).toMatchObject({ type: 'study', item: { id: '1' } });
  });

  it('skips questions already waiting for the judge, and idles when there is nothing to do', () => {
    expect(planStep({ bank: [item('1'), item('2')], pendingItemIds: ['1'], unaskedConflicts: [], due: [] })).toMatchObject({ item: { id: '2' } });
    expect(planStep({ bank: [item('1', 'rejected')], pendingItemIds: [], unaskedConflicts: [], due: [] })).toEqual({ type: 'idle' });
  });

  it('turns a conflict into a question that names both claims', () => {
    expect(resolveQuestion(conflict)).toContain('Boil one minute.');
    expect(resolveQuestion(conflict)).toContain('Boil ten minutes.');
  });

  it('refuses a question that has nothing to do with the original task', () => {
    const bank = [{ q: 'How long should water be boiled?' }];
    expect(onTask('What temperature kills bacteria in water?', 'Safe drinking water', bank)).toBe(true);
    expect(onTask('Explain the history of chess openings', 'Safe drinking water', bank)).toBe(false);
  });

  it('bounds the question list by dropping the oldest finished questions only', () => {
    const many = Array.from({ length: 200 }, (_, i) => item(`d${i}`, 'dropped')).concat([item('live', 'approved')]);
    const kept = pruneBank(many);
    expect(kept).toHaveLength(151);
    expect(kept.some((b) => b.id === 'live')).toBe(true);
    expect(kept.some((b) => b.id === 'd0')).toBe(false);
  });
});
