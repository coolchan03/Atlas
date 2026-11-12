import { exportLedger, importLedger } from '../../../src/learning/knowledgePorting';
import { fromKnowledgeJsonl, toKnowledgeJsonl, validateKnowledgeRecord } from '../../../src/learning/knowledgeInterchange';
import { ingestClaims } from '../../../src/learning/claimIngest';
import { MasteryStore } from '../../../src/learning/masteryStore';
import { MemoryLedger } from '../../../src/learning/memoryLedger';
import { ExamStore } from '../../../src/learning/exams';
import { buildTrainingSet, bucketOf, toSftJsonl } from '../../../src/learning/trainingExport';
import { memoryKnowledgeDb } from '../../harness/memoryKnowledgeDb';

const src = (passage: string) => [{ n: 1, title: 'Water manual', kind: 'library', passage, retrievedAt: '2026-01-01T00:00:00.000Z' }];

/** A ledger with a verified claim, a conflict, experience, a procedure, an exam result and mastery. */
function filled() {
  const db = memoryKnowledgeDb();
  ingestClaims(db, { topic: 'water', question: 'How long to boil water?', reportId: 'r1', reportText: 'ANSWER: Boil the water for one minute. [1]', sources: src('Boil water for one minute.'), reportStatus: 'candidate', reportNote: '' });
  db.reviewClaim({ id: 'r1:claim:1', status: 'verified', actor: 'device-owner-review', reason: 'checked the manual' });
  ingestClaims(db, { topic: 'water', question: 'How long to boil water?', reportId: 'r2', reportText: 'ANSWER: Boil the water for ten minutes. [1]', sources: src('Boil water for ten minutes.'), reportStatus: 'candidate', reportNote: '' });
  new MemoryLedger(db).recordExperience({ topic: 'water', attempt: 'Boil 10 minutes', outcome: 'failed', correction: 'One minute' });
  new MemoryLedger(db).saveProcedure({ topic: 'water', method: 'Check every number against the passage.', provenance: 'manager suggestion' });
  new MasteryStore(db).record('s', { question: 'How long to boil water?', topic: 'water' }, 'partial');
  const exams = new ExamStore(db);
  exams.saveResult('baseline', { total: 1, correct: 0, accuracy: 0, outdatedAnswers: 0, unsupportedCitations: 0, repeatFailures: 0, averageSeconds: 1, items: [] });
  exams.addItem({ subjectId: 's', topic: 'water', question: 'SECRET EXAM QUESTION about boiling?', expected: { facts: [['one minute']] } });
  return db;
}
const everything = { statuses: ['candidate', 'verified', 'disputed', 'superseded', 'rejected'] as any, includePassages: true };

describe('exporting and importing the whole ledger', () => {
  it('carries claims with evidence, conflicts, history, experience, procedures, exam results and progress', () => {
    const types = new Set(exportLedger(filled(), everything).map((r) => r.recordType));
    expect([...types].sort()).toEqual(['claim', 'claim_history', 'contradiction', 'exam_result', 'experience', 'mastery', 'procedure']);
  });

  it('never exports exam questions', () => {
    expect(toKnowledgeJsonl(exportLedger(filled(), everything))).not.toContain('SECRET EXAM QUESTION');
  });

  it('round-trips through JSONL into an empty ledger, and exporting again gives the same records', () => {
    const jsonl = toKnowledgeJsonl(exportLedger(filled(), everything));
    const fresh = memoryKnowledgeDb();
    const summary = importLedger(fresh, fromKnowledgeJsonl(jsonl));
    expect(summary.skipped).toBe(0);
    const again = toKnowledgeJsonl(exportLedger(fresh, everything));
    const strip = (t: string) => t.split('\n').filter(Boolean).map((l) => {
      const o = JSON.parse(l);
      if (o.recordType === 'claim') return { ...o, status: o.status === 'candidate' ? 'x' : o.status, uncertainty: null };
      return o.recordType === 'procedure' ? { ...o, provenance: o.provenance.replace('imported: ', '') } : o;
    });
    expect(strip(again)).toEqual(strip(jsonl));
  });

  it('importing twice adds nothing the second time', () => {
    const records = fromKnowledgeJsonl(toKnowledgeJsonl(exportLedger(filled(), everything)));
    const fresh = memoryKnowledgeDb();
    importLedger(fresh, records);
    const second = importLedger(fresh, records);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(records.length);
  });

  it('never grants verified on import, keeps restrictive statuses, and keeps imported procedures unverified', () => {
    const fresh = memoryKnowledgeDb();
    importLedger(fresh, fromKnowledgeJsonl(toKnowledgeJsonl(exportLedger(filled(), everything))));
    const counts = fresh.getReliabilitySnapshot().counts;
    expect(counts.verified).toBe(0);
    expect(counts.disputed).toBeGreaterThanOrEqual(1);
    expect(new MemoryLedger(fresh).procedures('water')[0]).toMatchObject({ status: 'unverified' });
  });

  it('says on a claim that arrived as verified that it was not reviewed on this device', () => {
    const db = memoryKnowledgeDb();
    ingestClaims(db, { topic: 'water', question: 'Q', reportId: 'r1', reportText: 'ANSWER: Boil the water for one minute. [1]', sources: src('Boil water for one minute.'), reportStatus: 'candidate', reportNote: '' });
    db.reviewClaim({ id: 'r1:claim:1', status: 'verified', actor: 'me', reason: 'checked' });
    const fresh = memoryKnowledgeDb();
    importLedger(fresh, fromKnowledgeJsonl(toKnowledgeJsonl(exportLedger(db, { statuses: ['verified'], includePassages: true }))));
    expect(fresh.getClaim('r1:claim:1')).toMatchObject({ status: 'candidate' });
    expect(fresh.getClaim('r1:claim:1')?.uncertainty).toContain('not reviewed on this device');
  });

  it('refuses malformed records and changes nothing', () => {
    const fresh = memoryKnowledgeDb();
    const good = exportLedger(filled(), everything);
    expect(() => importLedger(fresh, [...good, { format: 'atlas-knowledge-jsonl', schemaVersion: 1, recordType: 'claim', id: 'x' }])).toThrow(/Missing knowledge field/);
    expect(fresh.getReliabilitySnapshot().counts.candidate).toBe(0);
    expect(() => validateKnowledgeRecord({ format: 'other' })).toThrow(/Unsupported/);
    expect(() => validateKnowledgeRecord({ format: 'atlas-knowledge-jsonl', schemaVersion: 1, recordType: 'mastery', id: 'm', subjectId: 's', topic: 't', question: 'q', nextReview: 'n', strength: 'high', streak: 0, attempts: 0 })).toThrow(/invalid number/);
  });
});

describe('a training dataset that cannot leak or invent', () => {
  const claim = (i: number, over: Record<string, unknown> = {}) => ({
    format: 'atlas-knowledge-jsonl', schemaVersion: 1, recordType: 'claim', id: `c${i}`, topic: 't', question: `What is fact number ${i} about rivers?`, claim: `Fact ${i} is true. [1]`,
    status: 'verified', reportId: `r${i}`, createdAt: 'a', updatedAt: 'a', citations: [{ title: 'Atlas', passage: 'Fact text.' }], ...over,
  }) as any;

  it('uses only verified claims that have a passage, and drops anything on the exam', () => {
    const claims = [claim(1), claim(2, { status: 'candidate' }), claim(3, { citations: [{ title: 'No passage' }] }), claim(4, { question: 'How long to boil water?' })];
    const set = buildTrainingSet({ claims, examQuestions: ['How long should I boil water?'] });
    expect(set.manifest.counts).toMatchObject({ eligible: 3, excludedNoPassage: 1, excludedExamLeak: 1 });
    const all = [...set.examples.train, ...set.examples.validation, ...set.examples.test];
    expect(all).toHaveLength(1);
    expect(all[0].messages[1].content).toBe('Fact 1 is true.');
    expect(all[0].provenance).toMatchObject({ claimId: 'c1', verifiedBy: 'device-owner-review' });
  });

  it('puts the same question in the same split every time, in roughly 80/10/10', () => {
    expect(bucketOf('Same question')).toBe(bucketOf('same   question'));
    const claims = Array.from({ length: 200 }, (_, i) => claim(i));
    const { examples } = buildTrainingSet({ claims, examQuestions: [] });
    expect(examples.train.length).toBeGreaterThan(130);
    expect(examples.validation.length + examples.test.length).toBeGreaterThan(15);
    expect(buildTrainingSet({ claims, examQuestions: [] }).examples.test.map((e) => e.provenance.claimId)).toEqual(examples.test.map((e) => e.provenance.claimId));
  });

  it('says nothing was trained, asks for the base model, and needs authorization for any paid service', () => {
    const manifest = buildTrainingSet({ claims: [claim(1)], examQuestions: [] }).manifest;
    expect(manifest.baseModel).toBeNull();
    expect(manifest.notes.join(' ')).toMatch(/not trained/);
    expect(manifest.notes.join(' ')).toMatch(/does not start paid services/);
    expect(manifest.notes.join(' ')).toMatch(/Choose the exact base model/);
    expect(toSftJsonl([])).toBe('');
  });
});
