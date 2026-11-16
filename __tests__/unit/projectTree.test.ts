import { ancestorsOf, descendantsOf, listRows, scopeIds, wouldLoop } from '../../src/stores/projectTree';

const p = (id: string, parentId?: string) => ({ id, parentId, name: id });
const order = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

describe('projects inside projects', () => {
  const all = [p('cpa'), p('far', 'cpa'), p('aud', 'cpa'), p('leases', 'far'), p('other')];

  it('knows the folders around a project, nearest first, and what is inside a folder at any depth', () => {
    expect(ancestorsOf(all, 'leases')).toEqual(['far', 'cpa']);
    expect(scopeIds(all, 'far')).toEqual(['far', 'cpa']);
    expect(scopeIds(all, 'other')).toEqual(['other']);
    expect(descendantsOf(all, 'cpa').map((x) => x.id).sort()).toEqual(['aud', 'far', 'leases']);
  });

  it('refuses a loop, and cannot hang on bad data', () => {
    expect(wouldLoop(all, 'cpa', 'leases')).toBe(true);
    expect(wouldLoop(all, 'cpa', 'cpa')).toBe(true);
    expect(wouldLoop(all, 'other', 'cpa')).toBe(false);
    const looped = [p('a', 'b'), p('b', 'a')];
    expect(ancestorsOf(looped, 'a')).toEqual(['b']);
  });

  it('lists the top level, and shows what is inside a folder only when it is open', () => {
    expect(listRows(all, new Set(), order).map((r) => r.project.id)).toEqual(['cpa', 'other']);
    const open = listRows(all, new Set(['cpa', 'far']), order);
    expect(open.map((r) => `${r.depth}:${r.project.id}`)).toEqual(['0:cpa', '1:aud', '1:far', '2:leases', '0:other']);
    expect(open[0]).toMatchObject({ folder: true, open: true });
    expect(open.find((r) => r.project.id === 'other')).toMatchObject({ folder: false });
    // A project whose folder was removed shows at the top rather than vanishing.
    expect(listRows([p('lost', 'gone')], new Set(), order).map((r) => r.project.id)).toEqual(['lost']);
  });
});

describe('the project store with folders', () => {
  it('moves what is inside a deleted folder up instead of deleting it, and refuses a loop', () => {
    jest.resetModules();
    const { useProjectStore } = require('../../src/stores'); // loads the chat store too, which a deleted project's chats are un-filed from
    const s = () => useProjectStore.getState();
    useProjectStore.setState({ projects: [] });
    const top = s().createProject({ name: 'Top', description: '', systemPrompt: '' });
    const mid = s().createProject({ name: 'Mid', description: '', systemPrompt: '', parentId: top.id });
    const leaf = s().createProject({ name: 'Leaf', description: '', systemPrompt: '', parentId: mid.id });
    expect(() => s().updateProject(top.id, { parentId: leaf.id })).toThrow(/inside itself/);
    s().deleteProject(mid.id);
    expect(s().getProject(leaf.id)?.parentId).toBe(top.id);
    s().deleteProject(top.id);
    expect(s().getProject(leaf.id)?.parentId).toBeUndefined();
  });
});
