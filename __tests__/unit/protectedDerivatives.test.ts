import { stripProtectedDerivatives } from '../../src/atlasTools/backupKeys';
let mockProjects: any[] = [];
jest.mock('../../src/stores/projectStore', () => ({ useProjectStore: { getState: () => ({ projects: mockProjects }) } }));
const useProjectStore = { setState: (s: { projects: any[] }) => { mockProjects = s.projects; } };

const exStore = JSON.stringify({ state: {
  exercises: { a: { id: 'a', projectId: 'secret' }, b: { id: 'b', projectId: 'open' }, c: { id: 'c' } },
  progress: { a: { attempts: 3 }, b: { attempts: 1 } },
}, version: 1 });
const topics = JSON.stringify({ state: { courses: [{ id: 'k1', projectId: 'secret' }, { id: 'k2', projectId: 'open' }, { id: 'k3' }] }, version: 1 });

describe('protected-project derivatives never travel as readable text', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [
      { id: 'secret', name: 'Taxes', pinVerifier: 'x' }, { id: 'sealed', name: 'S', protectedBlob: 'b' }, { id: 'open', name: 'Notes' },
    ] } as any);
  });
  it('drops practice questions and their progress that belong to a protected project', () => {
    const out = JSON.parse(stripProtectedDerivatives('atlas-exercises', exStore));
    expect(Object.keys(out.state.exercises).sort()).toEqual(['b', 'c']);
    expect(Object.keys(out.state.progress)).toEqual(['b']);
  });
  it('drops courses made inside a protected project', () => {
    expect(JSON.parse(stripProtectedDerivatives('atlas-topics', topics)).state.courses.map((c: any) => c.id)).toEqual(['k2', 'k3']);
  });
  it('leaves other stores and an install with no protected project untouched', () => {
    expect(stripProtectedDerivatives('atlas-notes', exStore)).toBe(exStore);
    useProjectStore.setState({ projects: [{ id: 'open', name: 'Notes' }] } as any);
    expect(stripProtectedDerivatives('atlas-exercises', exStore)).toBe(exStore);
  });
  it('is applied to what sync and backup export', () => {
    useProjectStore.setState({ projects: [{ id: 'secret', name: 'Taxes', pinVerifier: 'x' }] } as any);
    const { shareable } = require('../../src/services/nearbySync/stores');
    expect(Object.keys(JSON.parse(shareable('atlas-exercises', exStore)).state.exercises).sort()).toEqual(['b', 'c']);
  });
});
