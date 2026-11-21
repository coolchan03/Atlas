import { batchStruggled, GIVE_UP_AFTER, isStruggling, nextNotesBoost, restudyQuestion } from '../../../src/learning/struggle';
import { MasteryStore } from '../../../src/learning/masteryStore';
import { memoryKnowledgeDb } from '../../harness/memoryKnowledgeDb';

describe('when the learner keeps failing', () => {
  it('stops testing a question after it was missed several times with no recall since, not before', () => {
    expect(isStruggling({ attempts: GIVE_UP_AFTER, streak: 0, strength: 0.1 })).toBe(true);
    expect(isStruggling({ attempts: GIVE_UP_AFTER - 1, streak: 0, strength: 0.1 })).toBe(false);
    expect(isStruggling({ attempts: 5, streak: 1, strength: 0.1 })).toBe(false);
    expect(isStruggling({ attempts: 5, streak: 0, strength: 0.6 })).toBe(false);
  });

  it('widens the notes after a batch that mostly failed and goes back after a clean one', () => {
    expect(batchStruggled(['wrong', 'wrong', 'partial'])).toBe(true);
    expect(batchStruggled(['wrong', 'wrong'])).toBe(false); // too few to say
    expect(nextNotesBoost(1, ['wrong', 'wrong', 'wrong'])).toBe(1.5);
    expect(nextNotesBoost(2, ['wrong', 'wrong', 'wrong'])).toBe(2);
    expect(nextNotesBoost(1.5, ['correct', 'partial'])).toBe(1);
    expect(nextNotesBoost(1.5, ['correct', 'wrong'])).toBe(1.5);
    expect(restudyQuestion('What is X?')).toContain('What is X?');
  });

  it('rests a missed concept so it is not due again for days', () => {
    const now = new Date('2026-03-01T00:00:00Z');
    const store = new MasteryStore(memoryKnowledgeDb(), () => now);
    const concept = { question: 'What is X?', topic: 't' };
    for (let i = 0; i < 3; i++) store.record('s', concept, 'wrong');
    const [due] = store.due('s', new Date(now.getTime() + 86_400_000));
    expect(isStruggling(due)).toBe(true);
    store.rest(due.id, 3);
    expect(store.due('s', new Date(now.getTime() + 2 * 86_400_000))).toEqual([]);
    expect(store.due('s', new Date(now.getTime() + 4 * 86_400_000))).toHaveLength(1);
  });
});

describe('why an answer was missed, and studying it a different way', () => {
  const { diagnoseMiss, restudyQuestionFor } = require('../../../src/learning/struggle');

  it('an answer that says nothing is its own kind', () => {
    expect(diagnoseMiss('', ['Boil water for 1 minute.'])).toEqual([{ kind: 'no-answer', detail: 'the answer said nothing about it' }]);
    expect(diagnoseMiss('The notes do not answer the question.', ['Boil water for 1 minute.'])[0].kind).toBe('no-answer');
  });

  it('finds a figure that is missing or different', () => {
    const d = diagnoseMiss('Boil the water for ten minutes to make it safe to drink.', ['Boil water for 1 minute to make it safe to drink.']);
    expect(d[0]).toMatchObject({ kind: 'wrong-number' });
    expect(d[0].detail).toMatch(/figure 1/);
  });

  it('finds a figure given with the opposite sign', () => {
    const d = diagnoseMiss('The account closed with a balance of 1200 dollars on the ledger.', ['The account closed with a balance of -1200 dollars on the ledger.']);
    expect(d[0].kind).toBe('wrong-sign');
  });

  it('finds the right figure in the wrong unit', () => {
    const d = diagnoseMiss('The vehicle travelled 12 km along the coast road.', ['The vehicle travelled 12 miles along the coast road.']);
    expect(d[0].kind).toBe('wrong-unit');
  });

  it('finds the opposite of a claim', () => {
    const d = diagnoseMiss('The expense is not deductible in the year it was paid by the business.', ['The expense is deductible in the year it was paid by the business.']);
    expect(d.map((x: { kind: string }) => x.kind)).toContain('opposite');
  });

  it('finds a missing fact, and always says something specific', () => {
    const d = diagnoseMiss('Water is important for health and life on the planet generally.', ['Boiled water must cool before it is drunk to avoid scalding.']);
    expect(d[0].kind).toBe('missing-fact');
    expect(d[0].detail).toBeTruthy();
  });

  it('the most specific mistake comes first', () => {
    const d = diagnoseMiss('Boil for 5 minutes and drink it hot straight away.', ['Boil for 1 minute and let it cool before drinking.']);
    expect(d[0].kind).toBe('wrong-number');
  });

  it('the study question names what to look at and explains it differently each time the question is missed', () => {
    const q = 'How long should water be boiled?';
    const why = [{ kind: 'wrong-number', detail: 'the figure 1 is missing or different' }];
    const first = restudyQuestionFor(q, why, 1);
    const second = restudyQuestionFor(q, why, 2);
    const third = restudyQuestionFor(q, why, 3);
    expect(first).toMatch(/exact figures and signs \(the figure 1 is missing or different\)/);
    expect(first).toMatch(/small worked example/);
    expect(second).toMatch(/by contrast with the mistake/);
    expect(third).toMatch(/step by step/);
    expect(new Set([first, second, third]).size).toBe(3); // never the same words twice
    expect(restudyQuestionFor(q, why, 4)).toBe(first); // the approaches come round again
  });

  it('asks about the source when the last answer said nothing, and about the missing fact otherwise', () => {
    expect(restudyQuestionFor('Q?', [{ kind: 'no-answer', detail: 'x' }], 1)).toMatch(/what the sources say about it, since the last answer said nothing/);
    expect(restudyQuestionFor('Q?', [{ kind: 'missing-fact', detail: 'x' }], 1)).toMatch(/the fact that was left out/);
  });
});
