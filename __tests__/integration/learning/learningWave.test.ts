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


const cfg = (store: any, over: Record<string, unknown>) => store.getState().setConfig(AGENT, over);
const withPrompts = () => {
  const prompts: Array<{ role: string; user: string }> = [];
  const model = happyModel();
  mockReplies = (system, user) => {
    const role = system.startsWith('You are the manager') ? 'manager' : /You are (a strict but fair|a fair) judge/.test(system) ? 'judge' : system.startsWith('You are the judge') ? 'questions' : 'other';
    prompts.push({ role, user });
    return model(system, user);
  };
  return prompts;
};

describe('judge and manager look at the whole wave', () => {
  it('shows the judge the other reports of the wave, and the manager every report of it', async () => {
    const prompts = withPrompts();
    const { engine, store } = load();
    cfg(store, { bankSize: 3, reportsPerJudge: 1, judgesPerManager: 3 });
    await engine.startLearning(AGENT);
    const judges = prompts.filter((p) => p.role === 'judge');
    expect(judges.length).toBeGreaterThanOrEqual(2);
    expect(judges[0].user).not.toContain('THE OTHER REPORTS OF THIS WAVE');
    expect(judges[1].user).toContain('THE OTHER REPORTS OF THIS WAVE');
    expect(judges[1].user).toMatch(/PASS|FAIL/);
    const managers = prompts.filter((p) => p.role === 'manager');
    expect(managers.length).toBeGreaterThanOrEqual(1);
    expect(managers[0].user).toMatch(/ALL \d+ REPORTS OF THIS WAVE/);
  });

  it('answers a question the person asks as a report, judged and managed at once, ahead of the plan', async () => {
    const prompts = withPrompts();
    const { engine, store } = load();
    cfg(store, { bankSize: 2, reportsPerJudge: 9, judgesPerManager: 9 });
    const { askAsReport } = require('../../../src/learning/askReport');
    expect(askAsReport(AGENT, 'short')).toMatchObject({ queued: false });
    cfg(store, { topic: ' ' });
    expect(askAsReport(AGENT, 'How long should water be boiled?')).toMatchObject({ queued: false, why: expect.stringMatching(/learning first/) });
    cfg(store, { topic: 'Safe drinking water' });
    store.getState().addItems(AGENT, []);
    const queued = askAsReport(AGENT, 'How long should water be boiled to be safe at altitude?');
    expect(queued).toMatchObject({ queued: true });
    await new Promise((r) => setTimeout(r, 0));
    while (engine.isLearning()) await new Promise((r) => setTimeout(r, 20));
    const reports = store.getState().get(AGENT).reportLog;
    const asked = reports.find((r: any) => /at altitude/.test(r.q));
    expect(asked).toBeTruthy();
    expect(asked.status).not.toBe('waiting'); // judged straight away, not left for the usual batch of nine
    expect(prompts.some((p) => p.role === 'manager')).toBe(true); // and the manager looked at it too
  }, 30000);
});
