import { installNativeBoundary } from '../../harness/nativeBoundary';

function setup() {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const projects = require('../../../src/stores/projectStore');
  const chats = require('../../../src/stores/chatStore');
  const exp = require('../../../src/atlasTools/projectExport');
  return { useProjectStore: projects.useProjectStore, useChatStore: chats.useChatStore, ...exp };
}
const project = (id: string, extra: object = {}) => ({ id, name: `Project ${id}`, description: '', systemPrompt: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra });
const chat = (id: string, projectId: string, extra: object = {}) => ({ id, title: id, modelId: 'm', messages: [{ id: `${id}-1`, role: 'user', content: 'hello', timestamp: 1 }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', projectId, ...extra });

describe('one project in one file', () => {
  it('collects the project and only its own readable chats', async () => {
    const s = setup();
    s.useProjectStore.setState({ projects: [project('a'), project('b')] });
    s.useChatStore.setState({ conversations: [chat('c1', 'a'), chat('c2', 'b'), chat('c3', 'a', { isPrivate: true }), chat('c4', 'a', { pinVerifier: 'x' })] });
    const out = await s.collectProject('a');
    expect(out.project.id).toBe('a');
    expect(out.conversations.map((c: any) => c.id)).toEqual(['c1']);
  });

  it('refuses a PIN-protected project and a missing one', async () => {
    const s = setup();
    s.useProjectStore.setState({ projects: [project('p', { pinVerifier: 'v', protectedBlob: 'b' })] });
    await expect(s.collectProject('p')).rejects.toThrow(/PIN-protected/);
    await expect(s.collectProject('nope')).rejects.toThrow(/no longer exists/);
    expect(s.exportableProjects()).toEqual([]);
  });

  it('wants a long password before it writes anything', async () => {
    const s = setup();
    s.useProjectStore.setState({ projects: [project('a')] });
    await expect(s.exportProject('a', 'short')).rejects.toThrow(/at least 12/);
  });

  it('rejects files that are not for this app, hold protected projects, or carry another project\'s chats', () => {
    const s = setup();
    const good = { format: 'OffGridAtlasProject', version: 1, createdAt: 'x', project: project('a'), conversations: [chat('c1', 'a')], files: [] };
    expect(s.validateProjectFile(good).project.id).toBe('a');
    expect(() => s.validateProjectFile({ ...good, format: 'other' })).toThrow(/not an Atlas project file/);
    expect(() => s.validateProjectFile({ ...good, project: project('a', { pinVerifier: 'v' }) })).toThrow(/protected/);
    expect(() => s.validateProjectFile({ ...good, project: project('../x') })).toThrow(/not an Atlas project file/);
    expect(() => s.validateProjectFile({ ...good, conversations: [chat('c2', 'other')] })).toThrow(/does not belong/);
  });

  it('merges into the phone: the project and its chats arrive and everything else stays', async () => {
    const s = setup();
    s.useProjectStore.setState({ projects: [project('keep')] });
    s.useChatStore.setState({ conversations: [chat('mine', 'keep')] });
    const result = await s.applyProjectFile({ format: 'OffGridAtlasProject', version: 1, createdAt: 'x', project: project('new'), conversations: [chat('theirs', 'new')], files: [] });
    expect(result).toEqual({ name: 'Project new', chats: 1, documents: 0 });
    expect(s.useProjectStore.getState().projects.map((p: any) => p.id).sort()).toEqual(['keep', 'new']);
    expect(s.useChatStore.getState().conversations.map((c: any) => c.id).sort()).toEqual(['mine', 'theirs']);
  });
});
