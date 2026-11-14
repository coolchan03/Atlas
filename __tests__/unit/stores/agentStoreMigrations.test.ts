/** Agent store: built-in prompt migrations, activation, sampling overrides and prompts with lessons. */
import { installNativeBoundary } from '../../harness/nativeBoundary';

function load() {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const mod = require('../../../src/stores/agentStore');
  return { ...mod, merge: (persisted: unknown) => mod.useAgentStore.persist.getOptions().merge(persisted, mod.useAgentStore.getState()) };
}
const agent = (over: Record<string, unknown>) => ({ id: 'x', name: 'X', description: '', systemPrompt: 'p', createdAt: 1, updatedAt: 1, ...over });

describe('merging saved agents with the built-in ones', () => {
  it('adds new built-ins once and keeps deleted ones deleted', () => {
    const { merge, DEFAULT_AGENTS } = load();
    const first = merge({ agents: [agent({ id: 'mine' })], seenDefaults: [] });
    expect(first.agents.length).toBe(1 + DEFAULT_AGENTS.length);
    const second = merge({ agents: [agent({ id: 'mine' })], seenDefaults: DEFAULT_AGENTS.map((d: any) => d.id) });
    expect(second.agents.map((a: any) => a.id)).toEqual(['mine']);
    expect(merge(undefined).agents.length).toBeGreaterThan(0);
  });

  it('clears an old default of Atlas only once', () => {
    const { merge } = load();
    expect(merge({ agents: [], activeAgentId: 'atlas' }).activeAgentId).toBeNull();
    expect(merge({ agents: [], activeAgentId: 'atlas', noAgentDefaultMigrated: true }).activeAgentId).toBe('atlas');
  });

  it('upgrades old shipped prompts but never custom ones', () => {
    const { merge, DEFAULT_AGENTS } = load();
    const fid = DEFAULT_AGENTS.find((d: any) => d.id === 'field-id');
    const atlas = DEFAULT_AGENTS.find((d: any) => d.id === 'atlas');
    const out = merge({
      seenDefaults: DEFAULT_AGENTS.map((d: any) => d.id),
      agents: [
        agent({ id: 'field-id', systemPrompt: 'NEVER say a wild plant is fine' }),
        agent({ id: 'atlas', systemPrompt: 'You are ATLAS, an old prompt' }),
        agent({ id: 'jock-boyfriend', systemPrompt: 'Roleplay a warm, confident, sporty, playful boyfriend character here' }),
        agent({ id: 'counselor', systemPrompt: 'You are a warm, skilled counselor having a private conversation with someone', enabledTools: ['calculator'] }),
        agent({ id: 'custom', systemPrompt: 'mine', enabledTools: ['calculator'] }),
      ],
    });
    const byId = (id: string) => out.agents.find((a: any) => a.id === id);
    expect(byId('field-id').systemPrompt).toBe(fid.systemPrompt);
    expect(byId('atlas').systemPrompt).toBe(atlas.systemPrompt);
    expect(byId('jock-boyfriend').name).toBeTruthy();
    expect(byId('counselor').enabledTools).toContain('update_project_document');
    expect(byId('custom').systemPrompt).toBe('mine');
    expect(byId('custom').enabledTools).toEqual(expect.arrayContaining(['calculator', 'study_math']));
  });
});

describe('using agents', () => {
  it('adds, updates, deletes and activates agents, bringing back a deleted built-in', () => {
    const { useAgentStore } = load();
    const st = () => useAgentStore.getState();
    const made = st().createAgent({ name: 'Mine', description: '', systemPrompt: 'hi', modelId: 'm1', contextLength: 4096 } as never);
    st().updateAgent(made.id, { name: 'Renamed' });
    expect(st().getAgent(made.id)?.name).toBe('Renamed');
    expect(st().getAgent(null)).toBeUndefined();
    st().setActiveAgent(made.id);
    st().updateAgent(made.id, { contextLength: 2048 });
    expect(st().activeAgentId).toBe(made.id);
    st().deleteAgent(made.id);
    expect(st().activeAgentId).toBeNull();
    st().setActiveAgent('not-real');
    expect(st().activeAgentId).toBeNull();
    st().deleteAgent('atlas');
    st().setActiveAgent('atlas');
    expect(st().agents.some((a: any) => a.id === 'atlas')).toBe(true);
    st().setActiveAgent(null);
  });

  it('fills the user name and appends lessons and memories', () => {
    const { fillUserName, agentPromptWithLessons } = load();
    expect(fillUserName('no placeholder')).toBe('no placeholder');
    expect(fillUserName('Hi {{name}}')).toBe('Hi the user');
    const text = agentPromptWithLessons(agent({ systemPrompt: ' Be kind ', lessons: ' Be brief ', memories: ['likes tea'] }));
    expect(text).toContain('Be kind');
    expect(text).toContain('Lessons learned');
    expect(text).toContain('- likes tea');
    expect(agentPromptWithLessons(agent({ systemPrompt: 'plain' }))).toBe('plain');
  });

  it('reports only the sampling settings the agent sets, and caps answers in audio mode and low power', () => {
    const { useAgentStore, activeAgentOverrides, activeAgentTools } = load();
    const ui = require('../../../src/stores/uiModeStore').useUiModeStore;
    expect(activeAgentOverrides()).toEqual({});
    expect(activeAgentTools()).toBeNull();
    ui.setState({ interfaceMode: 'audio' });
    expect(activeAgentOverrides().maxTokens).toBe(96);
    ui.setState({ interfaceMode: 'visual' });
    const a = useAgentStore.getState().createAgent({ name: 'T', description: '', systemPrompt: 'p', temperature: 0.3, topP: 0.8, maxTokens: 500, repeatPenalty: 1.2, enabledTools: ['calculator'] } as never);
    useAgentStore.setState({ activeAgentId: a.id });
    expect(activeAgentOverrides()).toEqual({ temperature: 0.3, topP: 0.8, maxTokens: 500, repeatPenalty: 1.2 });
    expect(activeAgentTools()).toEqual(['calculator']);
    ui.setState({ interfaceMode: 'audio' });
    expect(activeAgentOverrides().maxTokens).toBe(96);
    ui.setState({ interfaceMode: 'visual' });
    const low = require('../../../src/atlasTools/lowPowerState');
    jest.spyOn(low, 'lowPowerActive').mockReturnValue(true);
    expect(typeof activeAgentOverrides().maxTokens).toBe('number');
  });
});
