/**
 * Accountant mode, start to finish: a statement goes in, the AI (scripted here) suggests some categories, the person is
 * asked about the rest, a CSV comes out, and code proves every transaction is in it. Only the AI is faked.
 */
import { accountant, applyRules, readSuggestions, type AccountantCtx } from '../../../src/workflows/accountant';
import { advance, answer, approve, extractJson, newRun } from '../../../src/workflows/engine';

const STATEMENT = `Beginning balance 1,000.00
01/03 PAYROLL ACME INC 2,500.00 3,500.00
01/05 GROCERY OUTLET #12 -86.40 3,413.60
01/07 QWERTY HOLDINGS LLC -45.10 3,368.50
01/09 AMAZON MKTPLACE -29.99 3,338.51
Ending balance 3,338.51`;

const ctx = (): AccountantCtx => ({ text: STATEMENT, year: 2026, rules: {} });

// A model that is sure about two lines, guesses wrongly on one, and skips another.
const ask = jest.fn(async () => 'Sure. ```json\n[{"n":1,"category":"Income","sure":true},{"n":2,"category":"Groceries","sure":true},{"n":3,"category":"Made up category","sure":true}]\n```');

it('goes from a statement to a CSV that is proven complete, asking only about what the AI was unsure of', async () => {
  const saved: string[] = [];
  let run = await advance(accountant, newRun(accountant, 'r1', ctx()), { ask, save: (r) => saved.push(r.status) });
  expect(run.status).toBe('waiting');
  expect(run.waiting?.kind).toBe('ask');
  const unsure = run.waiting!.questions!;
  expect(unsure.map((q) => q.id)).toEqual(['2', '3']); // the invented category and the skipped line, not the two it got right
  expect(unsure[0].text).toContain('QWERTY HOLDINGS LLC');

  run = await answer(accountant, run, { answers: { '2': 'Fees', '3': 'Shopping' }, deps: { ask } });
  expect(run.status).toBe('waiting');
  expect(run.waiting?.kind).toBe('confirm');
  expect(run.waiting?.summary).toMatch(/All 4 transactions are in the file and the balances add up/);
  expect(run.ctx.csv).toBe([
    'Date,Description,Amount,Type,Category',
    '2026-01-03,PAYROLL ACME INC,2500.00,Credit,Income',
    '2026-01-05,GROCERY OUTLET #12,-86.40,Debit,Groceries',
    '2026-01-07,QWERTY HOLDINGS LLC,-45.10,Debit,Fees',
    '2026-01-09,AMAZON MKTPLACE,-29.99,Debit,Shopping',
    '',
  ].join('\n'));

  run = await approve(accountant, run, { ask });
  expect(run.status).toBe('done');
  expect(saved).toEqual(['running', 'running', 'waiting']); // saved after every step, so a closed app can resume
  // What the person decided is remembered for the next statement.
  expect(applyRules('QWERTY HOLDINGS 441', run.ctx.rules)).toBe('Fees');
});

it('does not let the person approve silently when a transaction is missing: the confirm step says what is wrong', async () => {
  const broken = { ...ctx(), text: STATEMENT.replace('01/05 GROCERY OUTLET #12 -86.40 3,413.60\n', '') };
  let run = await advance(accountant, newRun(accountant, 'r2', broken), { ask });
  run = await answer(accountant, run, { answers: { '1': 'Fees', '2': 'Shopping', '0': 'Income' }, deps: { ask } });
  expect(run.waiting?.summary).toMatch(/Not proven complete/);
  expect(run.waiting?.summary).toMatch(/The difference is/);
});

it('fails with a plain reason when the text has no transactions, and a failed step does not lose the earlier ones', async () => {
  const run = await advance(accountant, newRun(accountant, 'r3', { ...ctx(), text: 'hello world' }), { ask });
  expect(run.status).toBe('failed');
  expect(run.error).toMatch(/No transactions were found/);
});

it('reads a model reply with prose, fences or the wrong shape without crashing', () => {
  expect(extractJson('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
  expect(extractJson('no json here')).toBeNull();
  expect(readSuggestions('[{"n":1,"category":"groceries","sure":true},{"n":9,"category":"Fuel"},{"n":"x"}]', 2)).toEqual([{ category: 'Groceries', sure: true }, undefined]);
  expect(readSuggestions('nonsense', 2)).toEqual([undefined, undefined]);
});
