import { advance, newRun } from '../../src/workflows/engine';
import { budget, decision, mealWeek, mergeShopping, parseBudgetLines, scoreOptions, spreadTopics } from '../../src/workflows/moreJobs';

describe('budget', () => {
  it('reads lines and adds them exactly', async () => {
    expect(parseBudgetLines('Rent 1200\nGroceries: $450.50\nnothing here')).toEqual([{ name: 'Rent', cents: 120000 }, { name: 'Groceries', cents: 45050 }]);
    const ask = jest.fn(async () => '{"ideas":["Cook more at home (Groceries)"]}');
    const run = await advance(budget, newRun(budget, 'b', budget.input.make('Rent 1200\nGroceries 450.50', { income: '3000' })), { ask });
    expect(run.status).toBe('waiting');
    expect(run.ctx.leftover).toBe(134950);
  });
});
describe('study plan', () => {
  it('spreads topics in order and keeps the last day for review', () => {
    const plan = spreadTopics(['a', 'b', 'c', 'd'], 5);
    expect(plan.map((d) => d.topics)).toEqual([['a'], ['b'], ['c'], ['d'], ['Review everything, redo what you missed']]);
  });
});
describe('meal week', () => {
  it('merges the shopping list without repeats, and rejects a dinner with an avoided food', async () => {
    expect(mergeShopping([{ day: 'M', meal: 'x', items: ['Onion', 'Rice'] }, { day: 'T', meal: 'y', items: ['onions', 'Beans'] }])).toEqual(['Onion', 'Rice', 'Beans']);
    const ask = async () => JSON.stringify({ dinners: [{ meal: 'Peanut noodles', items: ['peanuts'] }, { meal: 'Rice', items: ['rice'] }, { meal: 'Soup', items: ['stock'] }] });
    const run = await advance(mealWeek, newRun(mealWeek, 'm', mealWeek.input.make('simple food', { avoid: 'peanuts' })), { ask });
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/peanut/i);
  });
});
describe('meal week with food on hand', () => {
  it('plans from what is on hand and keeps it off the shopping list, whatever the AI listed', async () => {
    const asked: string[] = [];
    const ask = async (system: string) => {
      asked.push(system);
      return JSON.stringify({ dinners: [{ meal: 'Egg fried rice', items: ['eggs', 'rice', 'soy sauce'] }, { meal: 'Spinach omelette', items: ['Eggs', 'spinach', 'cheese'] }, { meal: 'Bean chili', items: ['beans', 'tomatoes', 'rice'] }] });
    };
    const ctx = mealWeek.input.make('simple food', { pantry: 'eggs, rice\nspinach', diners: '2' });
    expect(ctx.pantry).toEqual(['eggs', 'rice', 'spinach']);
    const run = await advance(mealWeek, newRun(mealWeek, 'm', ctx), { ask });
    expect(asked[0]).toMatch(/already has: eggs, rice, spinach/);
    expect(run.status).toBe('waiting');
    expect(run.ctx.shopping).toEqual(['soy sauce', 'cheese', 'beans', 'tomatoes']);
    expect(run.waiting?.summary).toMatch(/Already on hand: eggs, rice, spinach/);
  });
});
describe('decision', () => {
  it('ranks by the sum of weights, computed in code', () => {
    const ranked = scoreOptions([
      { name: 'Stay', pros: [{ text: 'a', weight: 2 }], cons: [] },
      { name: 'Go', pros: [{ text: 'b', weight: 5 }], cons: [{ text: 'c', weight: 2 }] },
    ]);
    expect(ranked.map((o) => [o.name, o.score])).toEqual([['Go', 3], ['Stay', 2]]);
    expect(decision.steps).toHaveLength(3);
  });
});
