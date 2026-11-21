import { accountPool, accountsIn, balance, isJournalTask, journalToText, suggest } from '../../../src/topics/journal';
import { stepFeedback, stepOverlap } from '../../../src/topics/tryStep';

describe('journal entries as a table', () => {
  it('recognises a task that asks for an entry', () => {
    expect(isJournalTask('Prepare a journal entry to record the acquisition of equipment.')).toBe(true);
    expect(isJournalTask('Debit equipment and credit cash.')).toBe(true);
    expect(isJournalTask('Explain why revenue is recognised when available.', 'Because it is measurable.')).toBe(false);
  });

  it('finds the accounts a model answer uses, with or without amounts, and in a table', () => {
    expect(accountsIn('Dr. Equipment (Capital Asset) Cr. Cash')).toEqual(['Equipment', 'Cash']);
    expect(accountsIn('Debit Accounts Receivable $500, credit Service Revenue $500')).toEqual(['Accounts Receivable', 'Service Revenue']);
    expect(accountsIn('| Account | Debit | Credit |\n| --- | --- | --- |\n| Cash | 500 | |\n| Sales | | 500 |')).toEqual(['Cash', 'Sales']);
  });

  it('offers the task\'s own accounts first, then the standard ones, and narrows as the learner types', () => {
    const pool = accountPool('Dr. Equipment Cr. Cash');
    expect(pool.slice(0, 2)).toEqual(['Equipment', 'Cash']);
    expect(pool.filter((a) => a === 'Cash')).toHaveLength(1);
    expect(suggest('acc', pool).every((a) => /\bacc/i.test(a))).toBe(true);
    expect(suggest('pay', pool)).toContain('Accounts Payable');
    expect(suggest('', pool, 3)).toEqual(['Equipment', 'Cash', 'Accounts Receivable']);
  });

  it('turns the rows into marked lines: debits first, credits indented with Cr.', () => {
    expect(journalToText([{ account: 'Cash', debit: '', credit: '1,000' }, { account: 'Equipment', debit: '1,000', credit: '' }, { account: '', debit: '', credit: '' }]))
      .toBe('Dr. Equipment 1,000\n    Cr. Cash 1,000');
    // No numbers in the task: a mark in the column still says which side.
    expect(journalToText([{ account: 'Equipment', debit: 'x', credit: '' }, { account: 'Cash', debit: '', credit: 'x' }])).toBe('Dr. Equipment\n    Cr. Cash');
  });

  it('says whether debits and credits agree, and nothing when there are no amounts', () => {
    expect(balance([{ account: 'a', debit: '1,000', credit: '' }, { account: 'b', debit: '', credit: '$1000' }])).toMatchObject({ balanced: true, debits: 1000 });
    expect(balance([{ account: 'a', debit: '1000', credit: '' }, { account: 'b', debit: '', credit: '900' }])?.balanced).toBe(false);
    expect(balance([{ account: 'a', debit: 'x', credit: '' }])).toBeNull();
  });
});

describe('trying a step before it is shown', () => {
  it('counts the step\'s key words in the attempt', () => {
    expect(stepOverlap('subtract two from both sides', 'Subtract 2 from both sides undo +2')).toBeGreaterThan(0.3);
    expect(stepOverlap('multiply everything', 'Subtract 2 from both sides')).toBe(0);
  });
  it('only ever says close, compare or skipped', () => {
    expect(stepFeedback('', 'Subtract 2')).toBe('skipped');
    expect(stepFeedback('subtract 2', 'Subtract 2 from both sides')).toBe('close');
    expect(stepFeedback('add things', 'Subtract 2 from both sides')).toBe('compare');
  });
});
