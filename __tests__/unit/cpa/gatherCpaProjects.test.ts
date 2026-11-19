import { useProjectStore } from '../../../src/stores/projectStore';
import { useCpa } from '../../../src/cpa/store';
import { gatherCpaProjects, setupCpaExam } from '../../../src/cpa/setup';

it('moves older loose CPA exam projects into the CPA Study folder once, leaving other projects and nested ones alone', () => {
  const mk = (name: string, parentId?: string) => useProjectStore.getState().createProject({ name, description: '', systemPrompt: '', icon: '#000', parentId } as any);
  const loose = mk('My FAR notes');
  const other = mk('Cooking');
  setupCpaExam('AUD'); // makes the CPA Study folder
  const folder = useCpa.getState().groupProjectId!;
  useCpa.getState().setExam('FAR', { ...(useCpa.getState().exams.FAR ?? { topics: [] }), projectId: loose.id } as any);
  expect(gatherCpaProjects()).toBe(1);
  const byId = (id: string) => useProjectStore.getState().projects.find((p) => p.id === id)!;
  expect(byId(loose.id).parentId).toBe(folder);
  expect(byId(other.id).parentId).toBeUndefined();
  expect(gatherCpaProjects()).toBe(0);
});
