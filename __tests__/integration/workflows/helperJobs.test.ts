/**
 * The everyday jobs on the workflow engine. Only the AI is faked (scripted replies). Every check that protects the
 * person (a quote that must really be in their text, an allergy, a number that must survive a rewrite, a safety
 * warning) is real code and is exercised here.
 */
import { advance, answer, approve, newRun } from '../../../src/workflows/engine';
import { contract, cook, explain, howItWorks, repair, writing } from '../../../src/workflows/helperJobs';
import { allergenHits, hazardWarnings, lostNumbers, missingItems, quoteIn } from '../../../src/workflows/helpers';

const scripted = (...replies: string[]) => { const queue = [...replies]; return jest.fn(async () => queue.shift() ?? '{}'); };

describe('checks that do not trust the AI', () => {
  it('a quote counts only if it is really in the text', () => {
    expect(quoteIn('Rent is due on the 1st of each month.', 'rent is due on the 1st')).toBe(true);
    expect(quoteIn('Rent is due on the 1st of each month.', 'rent is due on the 15th')).toBe(false);
    expect(quoteIn('anything', 'ok')).toBe(false);
  });
  it('catches foods to avoid and finds what is not in the kitchen', () => {
    expect(allergenHits(['peanut butter', 'bread'], 'peanuts, shellfish')).toEqual(['peanut butter']);
    expect(allergenHits(['rice'], '')).toEqual([]);
    expect(missingItems(['rice', 'eggs', 'frozen peas'], ['rice', 'egg', 'soy sauce', 'salt', 'peas'])).toEqual(['soy sauce']);
  });
  it('flags numbers lost in a rewrite, and hazards by plain rules', () => {
    expect(lostNumbers('Pay $1,200 by 3/4.', 'Please pay by 3/4.')).toEqual(['1,200']);
    expect(hazardWarnings('there is a gas smell near the stove')[0]).toMatch(/leave/);
    expect(hazardWarnings('the outlet is sparking')[0]).toMatch(/breaker/);
    expect(hazardWarnings('the washer stops mid cycle')).toEqual([]);
  });
});

it('repair: asks, diagnoses, and adds a safety warning of its own when the problem is electrical', async () => {
  const ask = scripted(
    '{"questions":["Does it hum?","Is the cord damaged?"]}',
    '{"causes":[{"cause":"Worn switch","check":"try another outlet"}],"steps":["Unplug it","Try another outlet"],"stop_if":["It smells hot"],"call_a_professional":false}',
  );
  let run = await advance(repair, newRun(repair, 'r1', repair.input.make('The kitchen outlet sparks when I plug in the kettle', {})), { ask });
  expect(run.waiting?.questions).toHaveLength(2);
  run = await answer(repair, run, { answers: { '0': 'Yes', '1': 'No' }, deps: { ask } });
  expect(run.waiting?.summary).toMatch(/Safety first:\n- Switch the power off at the breaker/);
  expect(run.waiting?.summary).toMatch(/best left to a professional/); // the code raised it, the AI said false
  run = await approve(repair, run, { ask });
  expect(run.ctx.note).toContain('- [ ] Try another outlet');
});

it('cook: drops an idea with a food to avoid, asks which one, and lists what to buy', async () => {
  const ask = scripted(
    '{"recipes":[{"name":"Peanut noodles","minutes":15,"uses":["noodles","peanut butter"]},{"name":"Egg fried rice","minutes":20,"uses":["rice","eggs"],"also_needs":["soy sauce"]}]}',
    '{"ingredients":[{"item":"rice","amount":"2 cups"},{"item":"eggs","amount":"4"},{"item":"soy sauce","amount":"2 tbsp"}],"steps":["Cook the rice","Scramble the eggs","Stir together"]}',
  );
  const input = cook.input.make('rice, eggs, noodles, peanut butter', { diners: '2', time: '30 minutes', avoid: 'peanuts' });
  let run = await advance(cook, newRun(cook, 'c1', input), { ask });
  expect(run.waiting?.questions?.[0].options).toEqual(['Egg fried rice']); // the peanut idea never reaches the person
  expect(run.waiting?.questions?.[0].text).toMatch(/you would also need: soy sauce/);
  run = await answer(cook, run, { answers: { pick: 'Egg fried rice' }, deps: { ask } });
  expect(run.waiting?.summary).toMatch(/You would need to get: soy sauce/);
  run = await approve(cook, run, { ask });
  expect(run.ctx.note).toContain('# Egg fried rice');
});

it('cook: refuses a recipe that smuggles in a food to avoid', async () => {
  const ask = scripted(
    '{"recipes":[{"name":"Rice bowl","minutes":10,"uses":["rice"]}]}',
    '{"ingredients":[{"item":"rice","amount":"1 cup"},{"item":"crushed peanuts","amount":"1 tbsp"}],"steps":["Cook"]}',
  );
  let run = await advance(cook, newRun(cook, 'c2', cook.input.make('rice, eggs', { avoid: 'peanuts' })), { ask });
  run = await answer(cook, run, { answers: { pick: 'Rice bowl' }, deps: { ask } });
  expect(run.status).toBe('failed');
  expect(run.error).toMatch(/crushed peanuts/);
});

it('explain: points that quote the letter are shown, and one invented by the AI is marked as not found', async () => {
  const letter = 'Notice: your parking permit expires on 2026-04-01. Renew online to avoid a fee of $25.';
  const ask = scripted('{"what":"Permit notice","plain":"Your permit ends soon.","urgent":true,"todo":[{"text":"Renew online","quote":"Renew online to avoid a fee"},{"text":"Call the office","quote":"call the office before Friday"}],"dates":[{"what":"Expiry","date":"2026-04-01","quote":"expires on 2026-04-01"}],"amounts":[{"what":"Fee","amount":"$25","quote":"a fee of $25"}]}');
  let run = await advance(explain, newRun(explain, 'e1', explain.input.make(letter, {})), { ask });
  expect(run.waiting?.summary).toMatch(/- Renew online\n/);
  expect(run.waiting?.summary).toMatch(/- Call the office \[not found in your text\]/);
  expect(run.waiting?.summary).toMatch(/1 point could not be matched/);
  run = await approve(explain, run, { ask });
  expect(run.ctx.note).toContain('Not found in the original text');
  expect(run.ctx.note).not.toMatch(/## What to do[\s\S]*Call the office[\s\S]*## Dates/);
});

it('writing: says which numbers a rewrite dropped', async () => {
  const ask = scripted('{"rewrite":"Please pay soon."}');
  const run = await advance(writing, newRun(writing, 'w1', writing.input.make('Please pay $1,200 by 3/4 or a fee applies.', { mode: 'Shorter' })), { ask });
  expect(run.waiting?.summary).toMatch(/Numbers from your text that are missing: 1,200, 3\/4/);
});

it('how it works: only parts that quote the input are kept in the note', async () => {
  const ask = scripted('{"summary":"Adds two cells.","parts":[{"text":"Adds A1 and B1","quote":"=SUM(A1,B1)"},{"text":"Made up part","quote":"=VLOOKUP(Z9)"}],"watch_out":["Blank cells count as zero"]}');
  let run = await advance(howItWorks, newRun(howItWorks, 'h1', howItWorks.input.make('=SUM(A1,B1)', {})), { ask });
  run = await approve(howItWorks, run, { ask });
  expect(run.ctx.note).toContain('`=SUM(A1,B1)`: Adds A1 and B1');
  expect(run.ctx.note).not.toContain('VLOOKUP');
});

it('contract: marks a clause it cannot find in the text, and always says it is not legal advice', async () => {
  const text = `The lease runs for twelve months from the start date. Rent of $1,500 is due on the first of each month. ${'Other terms apply. '.repeat(12)}`;
  const ask = scripted('{"dates":[],"fees":[{"what":"Rent","amount":"$1,500","quote":"Rent of $1,500 is due on the first"}],"renewal":[{"text":"Auto-renews","quote":"renews automatically for another year"}],"cancellation":[],"unusual":[]}');
  let run = await advance(contract, newRun(contract, 'k1', contract.input.make(text, {})), { ask });
  expect(run.waiting?.summary).toMatch(/- Auto-renews \[clause not found in your text\]/);
  expect(run.waiting?.summary).toMatch(/not legal advice/);
  run = await approve(contract, run, { ask });
  expect(run.ctx.note).toContain('Not legal advice');
});
