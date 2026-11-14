/**
 * Conflicts stored by the older, noisier check: the same rule in different years, or loosely alike sentences, were recorded as
 * disagreements and each one became a "Two claims disagree" study question ahead of everything else. They are re-checked and closed
 * when learning starts, and real conflicts are kept. Real database; only the model and document search are faked.
 */
import { installRealSqlite } from '../../harness/sqliteFake';

const reportCount = (user: string) => (user.match(/^REPORT \d+/gm) ?? []).length;
const DIMS = 'FACTS 9 | CITES 9 | COMPLETE 7 | RELEVANT 9 | LOGIC 8 | CLEAR 8';
/** A model that answers each role the way a small one would, so one learning run finishes. */
let mockReplies: (system: string, user: string) => string = (system, user) => {
  if (system.startsWith('You plan how to become an expert')) return 'Q: What is the standard deduction for a single filer?\nQ: When is a return due?';
  if (system.startsWith('You are the judge. You check that study questions')) return '1: APPROVE\n2: APPROVE';
  if (/You are (a strict but fair|a fair) judge/.test(system)) return `${Array.from({ length: reportCount(user) }, (_, i) => `${i + 1}: PASS 8/10 | ${DIMS} - fine`).join('\n')}\nLESSON: Check numbers.`;
  if (system.startsWith('You answer only from the notes')) return 'It is stated in the notes.';
  if (system.startsWith('You are the manager')) return 'STATUS: ON TRACK\nDIRECTION: keep going\nJUDGE NOTE: fine\nDROP: none\nADD: none\nLESSON: Check numbers.';
  return 'ANSWER: The deduction is stated in the notes. [1]\nKEY POINTS:\n- It is in the notes. [1]';
};
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    isModelLoaded: () => true, isCurrentlyGenerating: () => false, getPerformanceSettings: () => ({ contextLength: 8192 }),
    generateResponse: async (messages: Array<{ role: string; content: string }>) => mockReplies(messages[0].content, messages[1].content),
  },
}));
jest.mock('../../../src/services/activeModelService', () => ({ activeModelService: { loadTextModel: jest.fn() } }));
jest.mock('../../../src/services/rag', () => ({ ragService: { searchProject: jest.fn(async () => ({ chunks: [{ name: 'Tax notes', content: 'The standard deduction is stated in these notes. The return is due in April.', doc_id: 1 }] })), indexDocument: jest.fn() } }));

const AGENT = '__no-agent__';
const TOPIC = 'Tax rules';
const claim = (db: any, id: string, text: string) => db.saveCandidate({
  id, topic: TOPIC, question: 'What is the rule?', claimText: text, reportId: 'r1', status: 'candidate', uncertainty: '', sources: [], citedNumbers: [], contextNumbers: [],
});

function load() {
  installRealSqlite();
  const { learningKnowledgeDb: db } = require('../../../src/learning/knowledgeDb');
  const { conflictReason } = require('../../../src/learning/claimText');
  const store = require('../../../src/learning/store');
  const engine = require('../../../src/learning/engine');
  store.useLearningStore.getState().setConfig(AGENT, { topic: TOPIC, projectId: 'p1', mode: 'keep', continuous: false, useLibrary: false, useWeb: false, bankSize: 2, reportsPerJudge: 2, judgesPerManager: 1 });
  return { db, conflictReason, store: store.useLearningStore, engine };
}

describe('closing conflicts that were never real', () => {
  it('closes a different-year pair and returns its claims to unreviewed, and keeps a real conflict', () => {
    const { db, conflictReason } = load();
    claim(db, 'y23', 'The standard deduction for a single filer in 2023 is 13850 dollars.');
    claim(db, 'y24', 'The standard deduction for a single filer in 2024 is 14600 dollars.');
    claim(db, 'r1', 'The standard deduction for a single filer in 2025 is 15000 dollars.');
    claim(db, 'r2', 'The standard deduction for a single filer in 2025 is 14000 dollars.');
    db.recordContradiction('y23', 'y24', 'States different numbers (13850 against 14600)'); db.flagDisputed('y23', 'x');
    db.recordContradiction('r1', 'r2', 'States different numbers (15000 against 14000)'); db.flagDisputed('r1', 'x');
    expect(db.openContradictions(10)).toHaveLength(2);
    const closed = db.dismissStaleContradictions((a: string, b: string) => !!conflictReason(a, b));
    expect(closed).toHaveLength(1);
    expect(closed[0].a + closed[0].b).toContain('2023');
    expect(db.openContradictions(10).map((c: { a: { id: string } }) => c.a.id)).toEqual(['r1']);
    expect(db.getClaim('y23').status).toBe('candidate'); // no longer disputed
    expect(db.getClaim('r1').status).toBe('disputed'); // the real one still is
    expect(db.dismissStaleContradictions((a: string, b: string) => !!conflictReason(a, b))).toHaveLength(0); // nothing more to do
  });

  it('leaves a claim disputed when its cited passage did not contain what it says', () => {
    const { db } = load();
    db.saveCandidate({ id: 'u1', topic: TOPIC, question: 'q', claimText: 'The limit is 5000 dollars for a household.', reportId: 'r', status: 'disputed', uncertainty: 'The cited passage does not contain 5000.', sources: [], citedNumbers: [], contextNumbers: [] });
    claim(db, 'u2', 'The limit is 5000 dollars for a household in a given year.');
    db.recordContradiction('u1', 'u2', 'Says the opposite of a known claim');
    db.dismissStaleContradictions(() => false);
    expect(db.getClaim('u1').status).toBe('disputed');
  });

  it('when learning starts, closes the stale conflicts, drops their study questions and says so', async () => {
    const { db, store, engine } = load();
    claim(db, 'y23', 'The standard deduction for a single filer in 2023 is 13850 dollars.');
    claim(db, 'y24', 'The standard deduction for a single filer in 2024 is 14600 dollars.');
    db.recordContradiction('y23', 'y24', 'States different numbers (13850 against 14600)');
    const { resolveQuestion } = require('../../../src/learning/cycleRules');
    const open = db.openContradictions(5, true)[0];
    store.getState().patch(AGENT, { bank: [{ id: 'b1', q: resolveQuestion(open), status: 'approved', tries: 0, round: 1, kind: 'resolve' }] });
    await engine.startLearning(AGENT);
    expect(db.openContradictions(10)).toHaveLength(0);
    expect(store.getState().get(AGENT).bank.some((b: { kind?: string }) => b.kind === 'resolve')).toBe(false);
    const events = store.getState().events.filter((e: { agentId: string }) => e.agentId === AGENT).map((e: { title: string }) => e.title);
    expect(events.some((t: string) => /^Cleared 1 conflict/.test(t))).toBe(true);
    expect(events).not.toContain('Two claims disagree');
  });
});
