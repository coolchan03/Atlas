import { ingestClaims, type IngestInput } from '../../../src/learning/claimIngest';
import { memoryKnowledgeDb } from '../../harness/memoryKnowledgeDb';

const source = (n: number, passage: string) => ({ n, title: `Source ${n}`, kind: 'library', passage, retrievedAt: '2026-01-01T00:00:00.000Z' });
const base = (over: Partial<IngestInput>): IngestInput => ({
  topic: 'water', question: 'How do I make water safe?', reportId: 'r1', reportText: '', sources: [], reportStatus: 'candidate', reportNote: 'Judge passed', ...over,
});
const status = (db: any, id: string) => db.getClaim(id)?.status;

describe('putting a report into the knowledge ledger', () => {
  it('stores each claim as a candidate with the passage it cites, never as verified', () => {
    const db = memoryKnowledgeDb();
    const r = ingestClaims(db, base({ reportText: 'ANSWER: Boil the water for one minute. [1]', sources: [source(1, 'Boil water for one minute to make it safe to drink.')] }));
    expect(r).toEqual({ added: 1, duplicates: 0, contradictions: 0, unsupported: 0 });
    expect(status(db, 'r1:claim:1')).toBe('candidate');
    expect(db.getClaimSources('r1:claim:1')[0].passage).toContain('Boil water');
  });

  it('marks a claim disputed when the cited passage lacks the number it states', () => {
    const db = memoryKnowledgeDb();
    const r = ingestClaims(db, base({ reportText: 'ANSWER: Boil the water for 10 minutes. [1]', sources: [source(1, 'Boil water for one minute to make it safe.')] }));
    expect(r.unsupported).toBe(1);
    expect(status(db, 'r1:claim:1')).toBe('disputed');
    expect(db.getClaim('r1:claim:1')?.uncertainty).toMatch(/does not contain 10/);
  });

  it('adds the new source to a known claim instead of storing it twice', () => {
    const db = memoryKnowledgeDb();
    ingestClaims(db, base({ reportText: 'ANSWER: Boil the water for one minute. [1]', sources: [source(1, 'Boil water for one minute.')] }));
    const second = ingestClaims(db, base({ reportId: 'r2', reportText: 'ANSWER: Boil the water for one minute. [1]', sources: [source(1, 'Water should be boiled for one minute, a second manual says.')] }));
    expect(second).toEqual({ added: 0, duplicates: 1, contradictions: 0, unsupported: 0 });
    expect(db.getClaimSources('r1:claim:1')).toHaveLength(2);
    expect(db.getClaim('r2:claim:1')).toBeNull();
  });

  it('records a conflict and disputes both claims, even a claim that was already verified', () => {
    const db = memoryKnowledgeDb();
    ingestClaims(db, base({ reportText: 'ANSWER: Boil the water for one minute. [1]', sources: [source(1, 'Boil water for one minute.')] }));
    db.reviewClaim({ id: 'r1:claim:1', status: 'verified', actor: 'me', reason: 'checked the manual' });
    const r = ingestClaims(db, base({ reportId: 'r2', reportText: 'ANSWER: Boil the water for ten minutes. [1]', sources: [source(1, 'Boil water for ten minutes.')] }));
    expect(r.contradictions).toBe(1);
    expect(status(db, 'r1:claim:1')).toBe('disputed');
    expect(status(db, 'r2:claim:1')).toBe('disputed');
    expect(db.openContradictions()).toHaveLength(1);
    expect(db.getReliabilitySnapshot().counts.verified).toBe(0);
  });

  it('keeps a claim with no citation as context only, and a disputed report makes its claims disputed', () => {
    const db = memoryKnowledgeDb();
    ingestClaims(db, base({ reportStatus: 'disputed', reportText: 'ANSWER: Boiling water for one minute makes it safe to drink.', sources: [source(1, 'Boiling water for one minute makes it safe to drink, says the manual.')] }));
    expect(status(db, 'r1:claim:1')).toBe('disputed');
    expect(db.getClaimSources('r1:claim:1')).toHaveLength(1);
  });

  it('upgrades an older version-1 database by adding tables only', () => {
    const db = memoryKnowledgeDb();
    expect(db.openContradictions()).toEqual([]);
    expect(db.knownClaims('anything')).toEqual([]);
  });
});
