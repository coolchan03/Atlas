import { installNativeBoundary } from '../harness/nativeBoundary';
import { answerCapFor, defaultAgentFor, SHORT_ANSWER_TOKENS } from '../../src/stores/projectDefaults';

describe('project defaults, the rules', () => {
  it('uses the default agent only while it still exists', () => {
    expect(defaultAgentFor({ defaultAgentId: 'a' }, ['a', 'b'])).toBe('a');
    expect(defaultAgentFor({ defaultAgentId: 'gone' }, ['a'])).toBeUndefined();
    expect(defaultAgentFor({}, ['a'])).toBeUndefined();
    expect(defaultAgentFor(undefined, ['a'])).toBeUndefined();
  });
  it('caps answers only for a project set to short', () => {
    expect(answerCapFor({ answerLength: 'short' })).toBe(SHORT_ANSWER_TOKENS);
    expect(answerCapFor({ answerLength: 'normal' })).toBeUndefined();
    expect(answerCapFor(undefined)).toBeUndefined();
  });
});

describe('project defaults, in the app', () => {
  function setup() {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const { useProjectStore } = require('../../src/stores/projectStore');
    const { useChatStore } = require('../../src/stores/chatStore');
    const { useAgentStore, activeAgentOverrides } = require('../../src/stores/agentStore');
    return { useProjectStore, useChatStore, useAgentStore, activeAgentOverrides };
  }
  const project = (id: string, extra: object) => ({ id, name: id, description: '', systemPrompt: '', createdAt: 'x', updatedAt: 'x', ...extra });

  it('starts a new chat in the project with its agent, and leaves other chats alone', () => {
    const { useProjectStore, useChatStore, useAgentStore } = setup();
    const agentId = useAgentStore.getState().agents[0].id;
    useProjectStore.setState({ projects: [project('p', { defaultAgentId: agentId }), project('q', {})] });
    const inP = useChatStore.getState().createConversation('m', undefined, 'p');
    const inQ = useChatStore.getState().createConversation('m', undefined, 'q');
    const loose = useChatStore.getState().createConversation('m');
    const byId = (id: string) => useChatStore.getState().conversations.find((c: any) => c.id === id);
    expect(byId(inP).agentId).toBe(agentId);
    expect(byId(inQ).agentId).toBeUndefined();
    expect(byId(loose).agentId).toBeUndefined();
  });

  it('keeps answers short in a short project while its chat is open, and not elsewhere', () => {
    const { useProjectStore, useChatStore, activeAgentOverrides } = setup();
    useProjectStore.setState({ projects: [project('p', { answerLength: 'short' }), project('q', {})] });
    const inP = useChatStore.getState().createConversation('m', undefined, 'p');
    expect(activeAgentOverrides().maxTokens).toBe(SHORT_ANSWER_TOKENS);
    const inQ = useChatStore.getState().createConversation('m', undefined, 'q');
    expect(inP).not.toBe(inQ);
    expect(activeAgentOverrides().maxTokens).toBeUndefined();
  });

  it('uses the chat\'s own agent for sampling, and never lets a short project raise an agent\'s smaller limit', () => {
    const { useProjectStore, useChatStore, useAgentStore, activeAgentOverrides } = setup();
    const terse = { id: 'terse', name: 'Terse', description: '', systemPrompt: 'Be brief.', maxTokens: 64, temperature: 0.2 };
    useAgentStore.setState({ agents: [...useAgentStore.getState().agents, terse], activeAgentId: null });
    useProjectStore.setState({ projects: [project('p', { defaultAgentId: 'terse', answerLength: 'short' })] });
    useChatStore.getState().createConversation('m', undefined, 'p');
    const ov = activeAgentOverrides();
    expect(ov.temperature).toBe(0.2); // from the project's default agent, though no agent is active globally
    expect(ov.maxTokens).toBe(64); // the agent's own limit stays below the project's 256
  });
});

describe('background jobs are not held to chat limits', () => {
  it('ignores a short-answer project, low-battery and heat limits while a job such as writing practice questions runs', async () => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const { useProjectStore } = require('../../src/stores/projectStore');
    const { useChatStore } = require('../../src/stores/chatStore');
    const { activeAgentOverrides } = require('../../src/stores/agentStore');
    const { useThermal } = require('../../src/atlasTools/thermalState');
    const { asBackground } = require('../../src/services/backgroundWork');
    useProjectStore.setState({ projects: [{ id: 'p', name: 'p', description: '', systemPrompt: '', createdAt: 'x', updatedAt: 'x', answerLength: 'short' }] });
    useChatStore.getState().createConversation('m', undefined, 'p');
    useThermal.getState().set(4);
    expect(activeAgentOverrides().maxTokens).toBeDefined(); // a chat reply is held short
    const inside = await asBackground(async () => activeAgentOverrides());
    expect(inside).toEqual({});
    await expect(asBackground(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(activeAgentOverrides().maxTokens).toBeDefined(); // and the limit is back afterwards, even after a failed job
  });
});

it('a chat reply being written is never background work, even while a job is open', async () => {
  const { asBackground, inBackgroundWork, setChatProbe } = require('../../src/services/backgroundWork');
  let chatting = false;
  setChatProbe(() => chatting);
  await asBackground(async () => {
    expect(inBackgroundWork()).toBe(true);
    chatting = true;
    expect(inBackgroundWork()).toBe(false);
  });
  setChatProbe(() => false);
});
