import { advance, answer, newRun } from '../../src/workflows/engine';
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
  expect(prompts[1]).toMatch(/Earlier results:\nresult 1/);
  expect(run.waiting?.summary).toBe('result 2');
});
