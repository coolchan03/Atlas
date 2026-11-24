import { advance, answer, approve, newRun } from '../../src/workflows/engine';
import { parseSteps, toWorkflow } from '../../src/workflows/customHelpers';

const source = 'field: Tone | Friendly, Formal\nfield: Names\nask: Keep it short? | Yes, No\nai: Write the reply in that tone.\nai: Fix anything missing.';

it('reads field, ask and ai lines and reports mistakes', () => {
  const p = parseSteps(source);
  expect(p.errors).toEqual([]);
  expect(p.fields.map((f) => f.options ?? null)).toEqual([['Friendly', 'Formal'], null]);
  expect(p.steps.map((s) => s.kind)).toEqual(['ask', 'ai', 'ai']);
  expect(parseSteps('hello\nask: Only one | A').errors).toHaveLength(3); // bad line, one choice, no ai step
});

it('runs a helper you wrote: asks, uses the AI for each ai line, and ends with a note after approval', async () => {
  const wf = toWorkflow({ id: 'x', title: 'Reply writer', summary: '', help: '', steps: source, createdAt: 1 });
  const prompts: string[] = [];
  const ask = async (_s: string, u: string) => { prompts.push(u); return `result ${prompts.length}`; };
  let run = await advance(wf, newRun(wf, 'r', wf.input.make('thanks for the lift', { f0: 'Friendly', f1: 'Sam' })), { ask });
  expect(run.status).toBe('waiting');
  run = await answer(wf, run, { answers: { q: 'Yes' }, deps: { ask } });
  expect(run.status).toBe('waiting'); // the review
  expect(prompts[0]).toMatch(/Tone: Friendly/);
  expect(prompts[0]).toMatch(/Keep it short\? Yes/);
  expect(prompts[1]).toMatch(/Result of the step before:\nresult 1/);
  expect(run.waiting?.summary).toBe('result 2');
});

describe('calc: steps (exact arithmetic done by code)', () => {
  const calcSource = 'field: Price\nfield: Qty\nfield: Tax\ncalc: Subtotal | {Price} * {Qty}\ncalc: Total | round({Subtotal} * (1 + {Tax} / 100), 2)\nai: Write a one line receipt note.';

  it('reads calc lines, and says what is wrong with one that cannot work', () => {
    expect(parseSteps(calcSource).errors).toEqual([]);
    expect(parseSteps(calcSource).steps.map((s) => s.kind)).toEqual(['calc', 'calc', 'ai']);
    expect(parseSteps('field: A\ncalc: Two | {A} +').errors[0]).toMatch(/Line 2: .*ends too soon/);
    expect(parseSteps('field: A\ncalc: Two | {B} + 1').errors[0]).toMatch(/\{b\} is not a field or a calc written above/);
    expect(parseSteps('calc: Later | {Next} + 1\ncalc: Next | 2').errors[0]).toMatch(/\{next\}/); // a calc cannot use one written below it
    expect(parseSteps('calc: no bar').errors[0]).toMatch(/looks like "calc: Total/);
    expect(parseSteps('field: A\ncalc: X | eval(1)').errors[0]).toMatch(/not a function/);
    expect(parseSteps('calc: Answer | 2 + 2').errors).toEqual([]); // a helper of calculations alone is fine
  });

  it('works the numbers out with code, hands them to the AI step, and puts them in the review and the note', async () => {
    const wf = toWorkflow({ id: 'c', title: 'Receipt', summary: '', help: '', steps: calcSource, createdAt: 1 });
    const prompts: string[] = [];
    const ask = async (_s: string, u: string) => { prompts.push(u); return 'Paid in full.'; };
    let run = await advance(wf, newRun(wf, 'r', wf.input.make('', { f0: '$1,200.50', f1: '3', f2: '8' })), { ask });
    expect(run.status).toBe('waiting');
    expect(prompts[0]).toMatch(/Subtotal: 3601\.5\nTotal: 3889\.62/);
    expect(run.waiting?.summary).toBe('Subtotal: 3601.5\nTotal: 3889.62\n\nPaid in full.');
    run = await approve(wf, run, { ask });
    expect(run.status).toBe('done');
    expect(run.ctx.note).toMatch(/## Calculations\n- Subtotal: 3601\.5\n- Total: 3889\.62/);
  });

  it('follows the usual order of operations, and stops with a clear sentence on a bad number or a zero divide', async () => {
    const run = async (steps: string, fields: Record<string, string>) => {
      const wf = toWorkflow({ id: 'c', title: 'T', summary: '', help: '', steps, createdAt: 1 });
      return advance(wf, newRun(wf, 'r', wf.input.make('', fields)), { ask: async () => 'x' });
    };
    expect((await run('calc: Answer | 2 + 3 * 4 ^ 2 / 8 - -1 + 10 % 4', {})).waiting?.summary).toBe('Answer: 11'); // 2 + 6 + 1 + 2 (four to the power two is 16)
    expect((await run('calc: Answer | max(3, abs(-7), sqrt(16)) + min(2, 5)', {})).waiting?.summary).toBe('Answer: 9');
    const text = await run('field: Price\ncalc: Twice | {Price} * 2', { f0: 'about ten' });
    expect(text).toMatchObject({ status: 'failed', error: 'Twice: "Price" needs a number (you typed "about ten").' });
    expect(await run('field: Price\ncalc: Twice | {Price} * 2', { f0: '' })).toMatchObject({ status: 'failed', error: 'Twice: "Price" needs a number (it is empty).' });
    expect(await run('field: N\ncalc: Bad | 5 / {N}', { f0: '0' })).toMatchObject({ status: 'failed', error: 'Bad: The calculation divides by zero.' });
    expect(await run('calc: Bad | sqrt(0 - 4)', {})).toMatchObject({ status: 'failed', error: expect.stringMatching(/no number as its answer/) });
  });
});

it('every example helper in the editor reads without a mistake and has a title, a summary and something to do', () => {
  const { EXAMPLE_HELPERS } = require('../../src/workflows/exampleHelpers');
  expect(EXAMPLE_HELPERS.length).toBeGreaterThanOrEqual(9);
  for (const x of EXAMPLE_HELPERS) {
    expect({ id: x.id, errors: parseSteps(x.steps).errors }).toEqual({ id: x.id, errors: [] });
    expect(x.title && x.summary && x.help).toBeTruthy();
  }
});

it('the temperature and budget examples give the right numbers', async () => {
  const { EXAMPLE_HELPERS } = require('../../src/workflows/exampleHelpers');
  const run = async (id: string, fields: Record<string, string>) => {
    const x = EXAMPLE_HELPERS.find((e: { id: string }) => e.id === id);
    const wf = toWorkflow({ id, title: x.title, summary: '', help: '', steps: x.steps, createdAt: 1 });
    return (await advance(wf, newRun(wf, 'r', wf.input.make('', fields)), { ask: async () => 'x' })).waiting?.summary;
  };
  expect(await run('temperature', { f0: '100' })).toBe('Fahrenheit: 212\nKelvin: 373.15');
  expect(await run('budget-502030', { f0: '3000' })).toBe('Needs (50%): 1500\nWants (30%): 900\nSavings (20%): 600');
  expect(await run('own-rate', { f0: '100', f1: '0.92' })).toBe('Converted: 92\nBack again: 100');
});

describe('numbered steps', () => {
  const steps = '1. List the decisions made.\nStep 2: List who must do what.\n3) Write a short email with both lists.';

  it('reads "1. ...", "Step 2: ..." and "3) ..." as steps for the AI, in order, and still takes the other kinds of line', () => {
    const p = parseSteps(steps);
    expect(p.errors).toEqual([]);
    expect(p.steps.map((s) => s.kind)).toEqual(['ai', 'ai', 'ai']);
    expect(p.steps.map((s) => s.text)).toEqual(['List the decisions made.', 'List who must do what.', 'Write a short email with both lists.']);
    expect(parseSteps('field: Tone | Formal, Friendly\n1. Write the reply.\ncalc: Two | 1 + 1').errors).toEqual([]);
    expect(parseSteps('just some words').errors[0]).toMatch(/numbered step/);
  });

  it('runs the steps one after the other, each with the results of the ones before it, and shows the last result', async () => {
    const wf = toWorkflow({ id: 'n', title: 'Follow-up', summary: '', help: '', steps, createdAt: 1 });
    const prompts: string[] = [];
    const ask = async (_s: string, u: string) => { prompts.push(u); return `result ${prompts.length}`; };
    const run = await advance(wf, newRun(wf, 'r', wf.input.make('the meeting notes', {})), { ask });
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toMatch(/Instruction: List the decisions made\./);
    expect(prompts[1]).toMatch(/Instruction: List who must do what\.[\s\S]*Result of the step before:\nresult 1/);
    expect(prompts[2]).toMatch(/Earlier steps:\nStep 1 \(short\): result 1\n\nResult of the step before:\nresult 2/);
    expect(run.waiting?.summary).toBe('result 3');
  });
});

describe('a long job in many steps does not overwhelm the model', () => {
  it('keeps every step prompt inside the budget, with the instruction and the latest result whole, however long the text and the chain', async () => {
    const { stepBudget } = require('../../src/workflows/stepPrompt');
    const lines = Array.from({ length: 10 }, (_, i) => `${i + 1}. Do part ${i + 1} of the job.`).join('\n');
    const wf = toWorkflow({ id: 'long', title: 'Long', summary: '', help: '', steps: lines, createdAt: 1 });
    const prompts: string[] = [];
    const ask = async (_s: string, u: string) => { prompts.push(u); return `RESULT-${prompts.length} ${'detail '.repeat(300)}`; };
    const text = `START ${'word '.repeat(8000)} END`; // about 40,000 characters
    await advance(wf, newRun(wf, 'r', wf.input.make(text, {})), { ask });
    const budget = stepBudget(4096);
    expect(prompts).toHaveLength(10);
    prompts.forEach((p, i) => {
      expect(p.length).toBeLessThanOrEqual(budget + 200);
      expect(p).toContain(`Instruction: Do part ${i + 1} of the job.`);
      if (i > 0) expect(p).toContain(`RESULT-${i} `); // the latest result is there
      if (i > 2 && i < 6) expect(/Step 1 \(short\): ([^\n]*)/.exec(p)?.[1].length).toBeLessThanOrEqual(160); // an old result is cut to its first words
    });
    expect(prompts[9]).toMatch(/START/); // the beginning and the end of a long text are both kept
    expect(prompts[9]).toMatch(/END/);
  });

  it('gives a small context window a small budget and a big one a bigger one', () => {
    const { stepBudget } = require('../../src/workflows/stepPrompt');
    expect(stepBudget(1024)).toBe(2400);
    expect(stepBudget(4096)).toBe(5461);
    expect(stepBudget(32768)).toBe(12000);
  });
});
