import { approxTokens, buildWorkingContext } from '../../../src/learning/workingContext';

const note = (id: string, text: string, status = 'verified', topic = 'leases') => ({ id, text, status, topic });

describe('bounded working context', () => {
  const q = 'How is an operating lease liability measured at the discount rate?';
  const notes = [
    note('a', 'An operating lease liability is the present value of lease payments at the discount rate.'),
    note('b', 'Photosynthesis happens in chloroplasts.'),
    note('c', 'The discount rate for a lease is the rate implicit in the lease, or the incremental borrowing rate.', 'candidate'),
    note('d', 'Lease liability for another project subject.', 'verified', 'pensions'),
  ];

  it('keeps only relevant notes of this topic, best first, and labels unreviewed ones', () => {
    const ctx = buildWorkingContext({ question: q, topic: 'leases', notes, budgetTokens: 500 });
    expect(ctx.usedNotes).toEqual(['a', 'c']);
    expect(ctx.text).toContain('(checked');
    expect(ctx.text).toContain('(not yet reviewed');
    expect(ctx.text).not.toContain('Photosynthesis');
    expect(ctx.text).not.toContain('another project');
  });

  it('stays inside the token budget, dropping what does not fit', () => {
    const ctx = buildWorkingContext({ question: q, topic: 'leases', notes, budgetTokens: 32 });
    expect(ctx.approxTokens).toBeLessThanOrEqual(32);
    expect(ctx.usedNotes).toHaveLength(1);
    expect(ctx.omitted).toBeGreaterThan(0);
  });

  it('adds deep passages with the room left, cutting a long one and marking it', () => {
    const long = `lease liability discount rate ${'payments are discounted '.repeat(200)}`;
    const ctx = buildWorkingContext({ question: q, topic: 'leases', notes, passages: [{ source: 'ASC 842.pdf', where: 'page 12', text: long }], budgetTokens: 200 });
    expect(ctx.usedPassages).toBe(1);
    expect(ctx.text).toContain('ASC 842.pdf, page 12');
    expect(approxTokens(ctx.text)).toBeLessThanOrEqual(200);
    expect(ctx.omitted).toBeGreaterThan(0);
  });

  it('is empty when nothing is relevant or there is no room', () => {
    expect(buildWorkingContext({ question: 'quantum chromodynamics', topic: 'leases', notes, budgetTokens: 500 }).text).toBe('');
    expect(buildWorkingContext({ question: q, topic: 'leases', notes, budgetTokens: 0 }).text).toBe('');
  });

  it('puts a checked note ahead of an equally relevant disputed one', () => {
    const ctx = buildWorkingContext({ question: q, topic: 'leases', notes: [note('x', 'Operating lease liability uses the discount rate.', 'disputed'), note('y', 'Operating lease liability uses the discount rate.', 'verified')], budgetTokens: 200 });
    expect(ctx.usedNotes).toEqual(['y', 'x']);
  });
});
