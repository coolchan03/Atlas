import { MasteryStore, conceptId, nextProgress } from '../../../src/learning/masteryStore';
import { MemoryLedger } from '../../../src/learning/memoryLedger';
import { memoryKnowledgeDb } from '../../harness/memoryKnowledgeDb';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);

describe('spaced review scheduling', () => {
  it('spaces correct answers further and further apart, and brings a wrong answer back within hours', () => {
    let p = nextProgress(null, 'correct', day(0));
    expect(p.nextReview).toEqual(day(1));
    p = nextProgress(p, 'correct', day(1));
    expect(p.nextReview).toEqual(day(4));
    p = nextProgress(p, 'correct', day(4));
    expect(p.nextReview).toEqual(day(11));
    const wrong = nextProgress(p, 'wrong', day(11));
    expect(wrong.streak).toBe(0);
    expect(wrong.nextReview.getTime() - day(11).getTime()).toBe(6 * 3_600_000);
  });

  it('gives a question one id however it is written', () => {
    expect(conceptId('How long do I boil water?')).toBe(conceptId('how long  do I boil water'));
    expect(conceptId('How long do I boil water?')).not.toBe(conceptId('How long do I boil milk?'));
  });
});

describe('tracking mastery in the ledger', () => {
  it('lists what is due, weakest first, and summarises progress', () => {
    const db = memoryKnowledgeDb();
    let now = day(0);
    const mastery = new MasteryStore(db, () => now);
    mastery.record('s', { question: 'Boil water how long?', topic: 'water' }, 'wrong');
    mastery.record('s', { question: 'Tourniquet where?', topic: 'first aid' }, 'correct');
    expect(mastery.due('s', day(0)).length).toBe(0);
    expect(mastery.due('s', day(2)).map((d) => d.question)).toEqual(['Boil water how long?', 'Tourniquet where?']);
    expect(mastery.summary('s', day(2))).toMatchObject({ tracked: 2, due: 2, mastered: 0 });
    for (let i = 0; i < 4; i++) { now = day(3 + i); mastery.record('s', { question: 'Tourniquet where?', topic: 'first aid' }, 'correct'); }
    expect(mastery.summary('s', day(3))).toMatchObject({ mastered: 1 });
    expect(mastery.due('other', day(30))).toEqual([]);
  });
});

describe('experience and procedural memory', () => {
  it('records attempts and finds the same mistake made again', () => {
    const memory = new MemoryLedger(memoryKnowledgeDb());
    memory.recordExperience({ topic: 'water', attempt: 'Boil 10 minutes', outcome: 'failed', correction: 'One minute' });
    memory.recordExperience({ topic: 'water', attempt: 'Boil 10 minutes', outcome: 'failed' });
    memory.recordExperience({ topic: 'water', attempt: 'Use tablets', outcome: 'failed' });
    expect(memory.repeatFailures('water')).toEqual([{ attempt: 'Boil 10 minutes', times: 2 }]);
    expect(memory.recentExperience('water')).toHaveLength(3);
  });

  it('keeps strategies unverified and skips near duplicates', () => {
    const memory = new MemoryLedger(memoryKnowledgeDb());
    expect(memory.saveProcedure({ topic: 'water', method: 'Check every number against the cited passage before accepting a claim.', provenance: 'manager' })).toBe(true);
    expect(memory.saveProcedure({ topic: 'water', method: 'Check every number against the cited passage before accepting a claim', provenance: 'manager' })).toBe(false);
    expect(memory.procedures('water')).toMatchObject([{ status: 'unverified', provenance: 'manager' }]);
  });
});
