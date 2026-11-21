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


describe('talking to what was learned', () => {
  const learn = async () => {
    mockReplies = happyModel();
    const t = load();
    await t.engine.startLearning(AGENT);
    return t;
  };

  it('answers from what was learned, with its status and where it came from', async () => {
    await learn();
    const { askLearned } = require('../../../src/learning/askLearned');
    const out = await askLearned('How long should water be boiled to make it safe?');
    expect(out).toContain('What was learned that bears on this question');
    expect(out).toMatch(/learned, not yet reviewed|checked by you|DISPUTED/);
    expect(out).toContain('boil');
    expect(out).toContain('not proven');
  });

  it('says nothing was learned and lists the connected sources to check, only the ones that exist', async () => {
    await learn();
    const { askLearned, connectedSources } = require('../../../src/learning/askLearned');
    const nothing = await askLearned('What is the capital of Mongolia and its population?', undefined);
    expect(nothing).toContain('Nothing was learned about this yet');
    expect(nothing).toContain('web_search');
    expect(nothing).toContain('instead of guessing');
    require('../../../src/atlasTools/offGridState').useOffGrid?.setState?.({ on: true });
    const offGrid = await connectedSources('p1');
    expect(offGrid.join(' ')).not.toContain('web_search');
  });

  it('tells the model to say it does not know when there is nothing learned and nothing connected', async () => {
    mockReplies = happyModel();
    load();
    jest.doMock('../../../src/atlasTools/offGridState', () => ({ offGridOn: () => true, useOffGrid: { getState: () => ({}) }, NETWORK_TOOLS: [] }));
    const { askLearned } = require('../../../src/learning/askLearned');
    expect(await askLearned('Something nobody studied at all, ever, anywhere')).toContain('there are no connected sources');
  });

  it('starts a chat with the learner: its agent, its project, and the tools to answer and to check sources', async () => {
    const { store } = await learn();
    jest.resetModules();
    const { useAppStore } = require('../../../src/stores');
    const { createDownloadedModel } = require('../../utils/factories');
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'm1' })], activeModelId: 'm1' });
    const learning = require('../../../src/learning/store').useLearningStore;
    learning.getState().setConfig(AGENT, { topic: 'Safe drinking water', projectId: 'p1' });
    const { startTalkChat, TALK_TOOLS } = require('../../../src/learning/talk');
    const chat = startTalkChat(AGENT);
    expect(chat.projectId).toBe('p1');
    expect(chat.starter).toContain('learned_knowledge');
    expect(chat.starter).toContain('Safe drinking water');
    const conv = require('../../../src/stores/chatStore').useChatStore.getState().conversations.find((c: any) => c.id === chat.conversationId);
    expect(conv.enabledTools).toEqual(TALK_TOOLS);
    expect(conv.projectId).toBe('p1');
    expect(store).toBeDefined();
    useAppStore.setState({ downloadedModels: [], activeModelId: null });
    expect(() => startTalkChat(AGENT)).toThrow('text model');
  });
});
