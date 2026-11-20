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
