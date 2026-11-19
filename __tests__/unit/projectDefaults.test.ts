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
});
