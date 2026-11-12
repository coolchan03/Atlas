/**
 * The whole learning cycle with a real database: bank, study, judge with separate gates, knowledge ledger, mastery,
 * practice, conflicts and the manager. Only the model and the document search are faked, at their boundaries.
 */
import { installRealSqlite } from '../../harness/sqliteFake';

const MANUAL = 'Boil water for one minute to make it safe. Let boiled water cool before drinking it.';

/** The scripted model: answers each role the way a small model would, keyed by what the prompt asks of it. */
let mockReplies: (system: string, user: string) => string;
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    isModelLoaded: () => true,
    isCurrentlyGenerating: () => false,
    getPerformanceSettings: () => ({ contextLength: 8192 }),
    generateResponse: async (messages: Array<{ role: string; content: string }>) => mockReplies(messages[0].content, messages[1].content),
  },
}));
jest.mock('../../../src/services/activeModelService', () => ({ activeModelService: { loadTextModel: jest.fn() } }));
jest.mock('../../../src/services/rag', () => ({
  ragService: { searchProject: jest.fn(async () => ({ chunks: [{ name: 'Water manual', content: MANUAL, doc_id: 1 }] })), indexDocument: jest.fn() },
}));

const AGENT = '__no-agent__';
const reportCount = (user: string) => (user.match(/^REPORT \d+/gm) ?? []).length;

const happyModel = (judgeDims = 'FACTS 9 | CITES 9 | COMPLETE 7 | RELEVANT 9 | LOGIC 8 | CLEAR 8'): typeof mockReplies => (system, user) => {
  if (system.startsWith('You plan how to become an expert')) return 'Q: How long should water be boiled to make it safe?\nQ: What should you do with boiled water before drinking it?';
  if (system.startsWith('You are the judge. You check that study questions')) return '1: APPROVE\n2: APPROVE';
  if (system.includes('You are a strict but fair judge')) {
    return `${Array.from({ length: reportCount(user) }, (_, i) => `${i + 1}: PASS 8/10 | ${judgeDims} - matches the manual`).join('\n')}\nLESSON: Check every number against the cited passage.`;
  }
  if (system.startsWith('You answer only from the notes')) return 'Boil the water for one minute to make it safe, then let it cool before drinking it.';
  if (system.startsWith('You are the manager')) return 'STATUS: ON TRACK\nDIRECTION: keep going\nJUDGE NOTE: fine\nDROP: none\nADD: none\nLESSON: Check every number against the cited passage.';
  // The learner's report, written from the numbered source it was given.
  return 'ANSWER: Boil the water for one minute to make it safe. [1]\nKEY POINTS:\n- Let boiled water cool before drinking it. [1]';
};

function load() {
  installRealSqlite();
  const engine = require('../../../src/learning/engine');
  const store = require('../../../src/learning/store');
  const ledger = require('../../../src/learning/knowledgeDb');
  const { MasteryStore } = require('../../../src/learning/masteryStore');
  const { MemoryLedger } = require('../../../src/learning/memoryLedger');
  store.useLearningStore.getState().setConfig(AGENT, { topic: 'Safe drinking water', projectId: 'p1', mode: 'keep', continuous: false, useLibrary: false, useWeb: false, bankSize: 2, reportsPerJudge: 2, judgesPerManager: 1 });
  return { engine, store: store.useLearningStore, db: ledger.learningKnowledgeDb, mastery: new MasteryStore(ledger.learningKnowledgeDb), memory: new MemoryLedger(ledger.learningKnowledgeDb) };
}
const events = (store: any) => store.getState().events.filter((e: any) => e.agentId === AGENT).map((e: any) => e.title);

it('learns a subject: claims with their passages, separate gates, mastery, procedures, and nothing auto-verified', async () => {
  mockReplies = happyModel();
  const { engine, store, db, mastery, memory } = load();
  await engine.startLearning(AGENT);

  const snapshot = db.getReliabilitySnapshot();
  expect(snapshot.counts.verified).toBe(0);
  expect(snapshot.counts.candidate).toBeGreaterThanOrEqual(2);
  expect(db.getClaimSources(snapshot.recent[0].id)[0].passage).toContain('Boil water for one minute');

  const reports = store.getState().get(AGENT).reportLog;
  expect(reports.length).toBe(2);
  expect(reports[0]).toMatchObject({ status: 'pass', gates: { facts: 'pass', citations: 'pass' } });
  expect(reports[0].dimensions).toMatchObject({ facts: 9, cites: 9 });

  expect(mastery.summary(AGENT)).toMatchObject({ tracked: 2 });
  expect(memory.procedures('Safe drinking water')[0]).toMatchObject({ status: 'unverified', provenance: 'manager suggestion' });
  expect(events(store).some((t: string) => /^Knowledge: \d+ new/.test(t))).toBe(true);
  expect(store.getState().get(AGENT).checkpoint).toBeUndefined();
});

it('a failed factual gate disputes the report even with a perfect overall score, and the mistake is remembered', async () => {
  mockReplies = happyModel('FACTS 2 | CITES 9 | CLEAR 10');
  const { engine, store, db, mastery, memory } = load();
  await engine.startLearning(AGENT);

  const reports = store.getState().get(AGENT).reportLog;
  expect(reports[0].gates.facts).toBe('fail');
  expect(reports[0].verificationStatus).toBe('disputed');
  expect(db.getReliabilitySnapshot().counts).toMatchObject({ disputed: expect.any(Number), verified: 0 });
  expect(memory.recentExperience('Safe drinking water').some((e: any) => e.outcome === 'disputed')).toBe(true);
  expect(mastery.due(AGENT, new Date(Date.now() + 86_400_000)).length).toBeGreaterThan(0);
});

it('practices what is due from stored knowledge and grades it by comparison, not by the model', async () => {
  mockReplies = happyModel();
  const { engine, store, db, mastery } = load();
  await engine.startLearning(AGENT);
  db.sql("UPDATE atlas_mastery SET next_review = '2000-01-01T00:00:00.000Z'");
  expect(mastery.due(AGENT).length).toBe(2);

  await engine.startLearning(AGENT);
  expect(events(store).some((t: string) => /^Practice: \d of \d recalled/.test(t))).toBe(true);
  const row = db.sql('SELECT streak, last_outcome FROM atlas_mastery ORDER BY question LIMIT 1').rows[0];
  expect(row.last_outcome).toBe('correct');
  expect(row.streak).toBe(1);
});

it('turns two conflicting claims into the first thing to study', async () => {
  mockReplies = happyModel();
  const { engine, store, db } = load();
  const { ingestClaims } = require('../../../src/learning/claimIngest');
  const src = (passage: string) => [{ n: 1, title: 'Manual', kind: 'library', passage }];
  ingestClaims(db, { topic: 'Safe drinking water', question: 'Q', reportId: 'a', reportText: 'ANSWER: Boil the water for one minute. [1]', sources: src('Boil water for one minute.'), reportStatus: 'candidate', reportNote: '' });
  ingestClaims(db, { topic: 'Safe drinking water', question: 'Q', reportId: 'b', reportText: 'ANSWER: Boil the water for ten minutes. [1]', sources: src('Boil water for ten minutes.'), reportStatus: 'candidate', reportNote: '' });
  expect(db.openContradictions(5, true)).toHaveLength(1);

  await engine.startLearning(AGENT);
  const bank = store.getState().get(AGENT).bank;
  expect(bank[0]).toMatchObject({ kind: 'resolve' });
  expect(bank[0].q).toContain('Two claims disagree');
  expect(db.openContradictions(5, true)).toHaveLength(0);
  expect(db.openContradictions(5)).toHaveLength(1);
  expect(events(store)).toContain('Two claims disagree');
});
