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
  if (/You are (a strict but fair|a fair) judge/.test(system)) {
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


const cfg = (store: any, over: Record<string, unknown>) => store.getState().setConfig(AGENT, over);

describe('learning under less friendly conditions', () => {
  it('stops with a readable problem when there is no task or no model', async () => {
    mockReplies = happyModel();
    const first = load();
    cfg(first.store, { topic: ' ' });
    await expect(first.engine.startLearning(AGENT)).rejects.toThrow('Set a task');
    expect(first.engine.isLearning()).toBe(false);
    mockReplies = () => { throw new Error('No model is loaded'); };
    const second = load();
    await second.engine.startLearning(AGENT);
    expect(second.store.getState().events.some((e: any) => e.kind === 'error' && /No model/.test(e.body))).toBe(true);
    expect(second.engine.isLearning()).toBe(false);
  });

  it('marks reports failed when the judge fails them, and keeps nothing as verified', async () => {
    mockReplies = (system, user) => {
      if (/You are (a strict but fair|a fair) judge/.test(system)) return Array.from({ length: reportCount(user) }, (_, i) => `${i + 1}: FAIL 2/10 | FACTS 1 | CITES 1 - wrong`).join('\n');
      return happyModel()(system, user);
    };
    const { engine, store, db } = load();
    await engine.startLearning(AGENT);
    const reports = store.getState().get(AGENT).reportLog;
    expect(reports.every((r: any) => r.status !== 'pass')).toBe(true);
    expect(db.getReliabilitySnapshot().counts.verified).toBe(0);
  });

  it('rejects questions the question judge does not approve', async () => {
    mockReplies = (system, user) => (system.startsWith('You are the judge. You check that study questions') ? '1: REJECT too vague\n2: REJECT duplicate' : happyModel()(system, user));
    const { engine, store } = load();
    await engine.startLearning(AGENT);
    expect(store.getState().get(AGENT).bank.some((b: any) => b.status === 'dropped' || b.status === 'rejected')).toBe(true);
  });

  it('works from the library and the web when allowed, in continuous mode, and can be stopped', async () => {
    mockReplies = happyModel();
    const { engine, store } = load();
    cfg(store, { useLibrary: true, useWeb: true, continuous: true, bankSize: 3 });
    const run = engine.startLearning(AGENT);
    expect(engine.isLearning()).toBe(true);
    await engine.startLearning(AGENT); // a second start while running does nothing
    engine.stopLearning();
    await run;
    expect(engine.isLearning()).toBe(false);
    engine.stopLearning(); // nothing running: does nothing
  });

  it('reports status text while it works', async () => {
    mockReplies = happyModel();
    const { engine } = load();
    const seen: string[] = [];
    engine.onLearningStatus((s: string) => seen.push(s));
    await engine.startLearning(AGENT);
    engine.onLearningStatus(null);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('keeps nothing on its own: a session only proposes, and an unreviewed Keep leaves the proposal for review', async () => {
    mockReplies = happyModel();
    const { engine, store } = load();
    cfg(store, { mode: 'session', continuous: false });
    await engine.startLearning(AGENT);
    expect(typeof (await engine.keepSession(AGENT))).toBe('string');
    store.getState().patch(AGENT, { sessionLessons: 'Check numbers\nCheck numbers\nBe brief', notes: [{ q: 'How long?', answer: 'One minute' }] });
    const message = await engine.keepSession(AGENT);
    expect(message).toMatch(/preserved for review \(2 lessons, 1 answers\)/);
    expect(store.getState().get(AGENT).sessionLessons).toBe('Check numbers\nCheck numbers\nBe brief'); // untouched
    expect(store.getState().get(AGENT).lessons ?? '').not.toContain('Be brief'); // and not kept
    expect(await engine.keepSession('no-such-agent')).toBeTruthy();
  });

  it('shows the proposal without repeats, with each answer numbered for review', () => {
    const { engine, store } = load();
    store.getState().patch(AGENT, { sessionLessons: 'Check numbers\nCheck numbers\n\n Be brief ', notes: [{ q: 'How long?', answer: 'One minute' }, { q: 'Cool?', answer: 'Yes' }] });
    expect(engine.sessionProposal(AGENT)).toEqual({
      lessons: ['Check numbers', 'Be brief'],
      answers: [{ index: 0, q: 'How long?', answer: 'One minute' }, { index: 1, q: 'Cool?', answer: 'Yes' }],
    });
  });

  it('keeps exactly what the person approved: those lessons join the agent, those answers go to the project, the rest stays proposed', async () => {
    const { engine, store } = load();
    const { ragService } = require('../../../src/services/rag');
    ragService.indexDocument.mockClear();
    store.getState().patch(AGENT, { sessionLessons: 'Check numbers\nBe brief\nGuess when unsure', notes: [{ q: 'How long?', answer: 'One minute' }, { q: 'Cool?', answer: 'Yes' }], lessons: 'Old lesson' });
    const message = await engine.keepSession(AGENT, { lessons: ['Check numbers', 'Be brief'], answers: [1] });
    expect(message).toBe("Kept 2 lessons and 1 answer (saved to the project's knowledge base).");
    const after = store.getState().get(AGENT);
    expect(after.lessons.split('\n')).toEqual(['Old lesson', 'Check numbers', 'Be brief']);
    expect(ragService.indexDocument).toHaveBeenCalledTimes(1);
    expect(ragService.indexDocument.mock.calls[0][0]).toMatchObject({ projectId: 'p1' });
    expect(after.sessionLessons).toBe('Guess when unsure'); // not approved: still proposed, not dropped
    expect(after.notes).toEqual([{ q: 'How long?', answer: 'One minute' }]); // the approved answer is out of the proposal, the other stays
  });

  it('does not keep a lesson the session never proposed', async () => {
    const { engine, store } = load();
    store.getState().patch(AGENT, { sessionLessons: 'Be brief', notes: [], lessons: '' });
    await engine.keepSession(AGENT, { lessons: ['Something I made up'] });
    expect(store.getState().get(AGENT).lessons).toBe('');
    expect(store.getState().get(AGENT).sessionLessons).toBe('Be brief');
  });

  it('an approved answer without a project is left proposed, and the message says why', async () => {
    const { engine, store } = load();
    cfg(store, { projectId: undefined });
    const { ragService } = require('../../../src/services/rag');
    ragService.indexDocument.mockClear();
    store.getState().patch(AGENT, { sessionLessons: '', notes: [{ q: 'How long?', answer: 'One minute' }] });
    const message = await engine.keepSession(AGENT, { answers: [0] });
    expect(message).toMatch(/needs a project to be saved in, so it was left proposed/);
    expect(ragService.indexDocument).not.toHaveBeenCalled();
    expect(store.getState().get(AGENT).notes).toHaveLength(1);
  });

  it('keeping the same lesson twice does not repeat it, and the agent keeps at most the newest sixteen', async () => {
    const { engine, store } = load();
    const many = Array.from({ length: 20 }, (_, i) => `Lesson ${i + 1}`);
    store.getState().patch(AGENT, { sessionLessons: many.join('\n'), notes: [], lessons: 'Lesson 1' });
    await engine.keepSession(AGENT, { lessons: many });
    const kept = store.getState().get(AGENT).lessons.split('\n');
    expect(kept).toHaveLength(16);
    expect(new Set(kept).size).toBe(16);
    expect(kept[kept.length - 1]).toBe('Lesson 20');
  });

  it('can throw a session away, and an empty session says there is nothing to keep', async () => {
    const { engine, store } = load();
    store.getState().patch(AGENT, { sessionLessons: 'Be brief', notes: [{ q: 'q', answer: 'a' }] });
    engine.discardSession(AGENT);
    expect(engine.sessionProposal(AGENT)).toEqual({ lessons: [], answers: [] });
    expect(await engine.keepSession(AGENT, { lessons: ['Be brief'] })).toMatch(/proposed nothing to keep/);
  });

  it('starts a new round and runs the manager on demand', async () => {
    mockReplies = happyModel();
    const { engine, store } = load();
    await engine.startLearning(AGENT);
    engine.newRound(AGENT);
    expect(store.getState().get(AGENT).bank.every((b: any) => b.status !== 'approved' && b.status !== 'pending')).toBe(true);
    await engine.auditNow(AGENT);
    expect(engine.isLearning()).toBe(false);
  });

  it('resumes after an interruption and says so', async () => {
    mockReplies = happyModel();
    const { engine, store } = load();
    store.getState().patch(AGENT, { checkpoint: { step: 'judging reports' } });
    await engine.startLearning(AGENT);
    expect(events(store)).toContain('Learning resumed after an interruption');
  });
});
