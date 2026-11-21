import { describeChatContext } from '../../src/chats/chatContext';

const base = { locked: false, privateChat: false, toolIds: [], offGrid: false };
describe('UX-15 what this chat uses', () => {
  it('states the real project, model, tools and privacy', () => {
    const lines = describeChatContext({ ...base, projectName: 'FAR prep', model: { name: 'Qwen 4B', remote: false, loaded: true }, toolIds: ['calculator'], offGrid: true, agentName: 'Coach' });
    expect(lines.join('\n')).toMatch(/Project: FAR prep/);
    expect(lines.join('\n')).toMatch(/Model: Qwen 4B, on this phone/);
    expect(lines.join('\n')).toMatch(/Tools on: calculator/);
    expect(lines.join('\n')).toMatch(/Off-grid: on/);
    expect(lines.join('\n')).toMatch(/Character: Coach \(your choice, not changed automatically\)/);
  });
  it('says plainly when text leaves the phone or the model is not loaded', () => {
    expect(describeChatContext({ ...base, model: { name: 'gpt', remote: true, loaded: true } }).join('\n')).toMatch(/text leaves this phone/);
    expect(describeChatContext({ ...base, model: { name: 'Big', remote: false, loaded: false } }).join('\n')).toMatch(/selected, not loaded yet/);
  });
  it('never shows a protected project or a locked chat model name, and says private chats are not saved', () => {
    const locked = describeChatContext({ ...base, locked: true, projectName: 'Taxes', model: { name: 'Qwen', remote: false, loaded: true } }).join('\n');
    expect(locked).not.toMatch(/Taxes|Qwen/);
    expect(describeChatContext({ ...base, projectName: 'Secret', projectLocked: true }).join('\n')).not.toMatch(/Secret/);
    expect(describeChatContext({ ...base, privateChat: true })[0]).toMatch(/not saved/);
  });
  it('lists a tool added for one turn separately from the chosen ones', () => {
    expect(describeChatContext({ ...base, toolIds: ['calculator'], routedThisTurn: ['study_math'] }).join('\n')).toMatch(/Added for this turn only: study_math/);
  });
});

describe('chatContextFor reads the live stores', () => {
  it('reports the selected local model, its load state, the project and the character', () => {
    const { chatContextFor } = require('../../src/chats/chatContext');
    const { useAppStore } = require('../../src/stores/appStore');
    const { useProjectStore } = require('../../src/stores/projectStore');
    const { useRemoteServerStore } = require('../../src/stores/remoteServerStore');
    useRemoteServerStore.setState({ activeRemoteTextModelId: null });
    useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Tiny 1B', engine: 'llama', filePath: '/m', fileSize: 1 }], activeModelId: 'm1', loadedTextModelId: null });
    const project = useProjectStore.getState().createProject({ name: 'Biology', description: '', systemPrompt: '', icon: '#000' });
    const text = chatContextFor({ id: 'c', title: 't', modelId: 'm1', messages: [], createdAt: '', updatedAt: '', projectId: project.id }).join('\n');
    expect(text).toMatch(/Project: Biology/);
    expect(text).toMatch(/Model: Tiny 1B, on this phone \(selected, not loaded yet\)/);
    useAppStore.setState({ loadedTextModelId: 'm1' });
    expect(chatContextFor({ id: 'c', title: 't', modelId: 'm1', messages: [], createdAt: '', updatedAt: '' }).join('\n')).not.toMatch(/not loaded yet/);
  });
});
