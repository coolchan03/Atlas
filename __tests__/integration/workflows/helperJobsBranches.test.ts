import { advance, answer, approve, newRun, type Workflow } from '../../../src/workflows/engine';
import { contract, cook, explain, howItWorks, repair, writing } from '../../../src/workflows/helperJobs';

const scripted = (...replies: string[]) => { const queue = [...replies]; return jest.fn(async () => queue.shift() ?? 'not json at all'); };
const j = (v: unknown) => JSON.stringify(v);

/** Runs a workflow to the end, answering questions with `answers` and approving every review. */
async function drive<C>(wf: Workflow<C>, ctx: C, replies: string[], answers: Record<string, string> = {}) {
  const ask = scripted(...replies);
  let run = await advance(wf, newRun(wf, 'r', ctx), { ask });
  for (let i = 0; i < 6 && run.status === 'waiting'; i++) run = run.waiting?.kind === 'ask' ? await answer(wf, run, { answers, deps: { ask } }) : await approve(wf, run, { ask });
  return run;
}

describe('repair', () => {
  const ctx = (t = 'The washer stops mid cycle and shows E21') => repair.input.make(t, {});
  it('fails clearly when the AI does not answer in JSON, or answers with an array', async () => {
    expect((await drive(repair, ctx(), ['I think the pump is blocked'])).error).toMatch(/did not answer in the expected form/);
    expect((await drive(repair, ctx(), ['[1,2,3]'])).error).toMatch(/did not answer in the expected form/);
  });
  it('skips the questions when there are none, defaults unanswered ones to Not sure, and keeps only well formed causes', async () => {
    const run = await drive(repair, ctx(), [j({ questions: [] }), j({ causes: [{ cause: 'Blocked pump', check: 'listen' }, { check: 'no cause' }, 'junk'], steps: ['Unplug it', '', 7], stop_if: ['Smoke'], call_a_professional: true })]);
    expect(run.status).toBe('done'); expect(run.ctx.causes).toEqual([{ cause: 'Blocked pump', check: 'listen' }]); expect(run.ctx.callPro).toBe(true);
    expect(run.log.join('\n')).toMatch(/nothing to ask/);
    const asked = await drive(repair, ctx(), [j({ questions: ['Does it hum?', 'Is it hot?'] }), j({ causes: [], steps: [], stop_if: [] })], { '0': 'Yes' });
    expect(asked.ctx.details).toBe('Does it hum? Yes\nIs it hot? Not sure');
  });
});

describe('cook', () => {
  const input = (items: string, over: Record<string, string> = {}) => cook.input.make(items, { diners: '4', time: '60 minutes', ...over });
  it('needs at least two items and reads the group size and time', async () => {
    const run = await drive(cook, input('rice'), []);
    expect(run.error).toMatch(/List at least two things/);
    expect(input('rice, eggs; oil\nsalt').items).toEqual(['rice', 'eggs', 'oil', 'salt']);
    expect(cook.input.make('a, b', {})).toMatchObject({ diners: 2, minutes: 30, avoid: '' });
    expect(cook.input.make('a, b', { diners: 'x', time: 'soon' })).toMatchObject({ diners: 2, minutes: 30 });
  });
  it('explains when every idea is unsafe or none came back', async () => {
    expect((await drive(cook, input('rice, eggs', { avoid: 'eggs' }), [j({ recipes: [{ name: 'Egg rice', uses: ['eggs', 'rice'] }] })])).error).toMatch(/No safe ideas/);
    expect((await drive(cook, input('rice, eggs'), [j({ recipes: [{ name: '', uses: [] }, { name: 'No uses', uses: [] }] })])).error).toMatch(/No safe ideas/);
  });
  it('uses the first idea when none is picked, and refuses an incomplete recipe', async () => {
    const ideas = j({ recipes: [{ name: 'Fried rice', minutes: 'x', uses: ['rice', 'eggs'], also_needs: ['soy sauce'] }] });
    const ok = await drive(cook, input('rice, eggs'), [ideas, j({ ingredients: [{ item: 'rice', amount: '2 cups' }, { item: 'eggs' }, { amount: 'no item' }], steps: ['Cook', 'Stir'] })]);
    expect(ok.ctx.chosen).toBe('Fried rice'); expect(ok.ctx.ideas?.[0].minutes).toBe(60); expect(ok.ctx.note).toContain('# Fried rice');
    expect((await drive(cook, input('rice, eggs'), [ideas, j({ ingredients: [], steps: [] })])).error).toMatch(/incomplete/);
  });
});

describe('explain, how it works, writing and contract', () => {
  it('explain: quotes must be in the text, and unverified points are labelled', async () => {
    const text = 'Your electricity bill of $120.50 is due on 3 March 2027. Pay online or by phone.';
    const reply = j({ what: 'A bill', plain: 'You owe money.', urgent: true, todo: [{ text: 'Pay it', quote: 'Pay online or by phone' }, { text: 'Invented', quote: 'send us a cheque' }], dates: [{ text: 'Due 3 March', quote: 'due on 3 March 2027' }], amounts: [{ text: 'Amount', quote: '$120.50' }] });
    const run = await drive(explain, explain.input.make(text, {}), [reply]);
    expect(run.status).toBe('done'); expect(run.ctx.urgent).toBe(true); expect(run.ctx.note).toMatch(/Not found in the original text/);
    const calm = await drive(explain, explain.input.make(text, {}), [j({ what: 'A note', plain: 'Fine.', urgent: false, todo: [], dates: [], amounts: [] })]);
    expect(calm.ctx.note).toContain('# A note');
  });
  it('how it works: lists only verified parts and warnings', async () => {
    const code = 'const total = items.reduce((s, x) => s + x.price, 0);';
    const run = await drive(howItWorks, howItWorks.input.make(code, {}), [j({ summary: 'Adds prices.', parts: [{ text: 'Sums prices', quote: 'items.reduce((s, x) => s + x.price, 0)' }, { text: 'Made up', quote: 'while(true)' }], watch_out: ['Empty list gives 0', ''] })]);
    expect(run.ctx.note).toMatch(/Sums prices/); expect(run.ctx.note).not.toMatch(/Made up/);
    const none = await drive(howItWorks, howItWorks.input.make(code, {}), [j({ summary: 'x', parts: [], watch_out: [] })]);
    expect(none.status).toBe('done');
  });
  it('writing: keeps numbers, reports what was lost, and fails on an empty rewrite', async () => {
    const original = 'Please pay $1,200 by 3/4 to Mr Okafor.';
    const lost = await drive(writing, writing.input.make(original, { mode: 'Shorter', sample: 'Hi, quick one.' }), [j({ rewrite: 'Please pay Mr Okafor soon.' })]);
    expect(lost.ctx.lost).toEqual(expect.arrayContaining(['1,200'])); expect(lost.waiting ?? lost.ctx.note).toBeDefined();
    const kept = await drive(writing, writing.input.make(original, {}), [j({ rewrite: 'Pay $1,200 by 3/4 to Mr Okafor.' })]);
    expect(kept.ctx.lost).toEqual([]); expect(kept.ctx.mode).toBe('Clearer'); expect(kept.ctx.note).toContain('Pay $1,200');
    expect((await drive(writing, writing.input.make(original, {}), [j({ rewrite: '' })])).error).toMatch(/No rewrite came back/);
  });
  it('contract: groups clauses, flags unfound ones, and always says it is not legal advice', async () => {
    const text = 'The tenant shall pay rent of $900 monthly on the first day. The lease renews automatically for twelve months unless notice is given sixty days before the end. '.repeat(2);
    const reply = j({ dates: [{ what: 'Rent due', date: '1st', quote: 'on the first day' }], fees: [{ what: 'Rent', amount: '$900', quote: 'rent of $900 monthly' }], renewal: [{ what: 'Auto renewal', quote: 'renews automatically for twelve months' }], cancellation: [{ what: 'Notice', quote: 'sixty days before the end' }], unusual: [{ what: 'Hidden fee', quote: 'a secret clause' }] });
    const run = await drive(contract, contract.input.make(text, {}), [reply]);
    expect(run.ctx.note).toMatch(/Not legal advice/); expect(run.ctx.note).toMatch(/clause not found in the text/);
    const empty = await drive(contract, contract.input.make(text, {}), [j({})]);
    expect(empty.status).toBe('done');
  });
});
