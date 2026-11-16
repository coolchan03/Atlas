/** Where a project's documents are searched: the project and the folders around it (not for a protected project, which keeps to itself). */
import { isProtectedProject } from './knowledgeSource';
import { scopeIds } from '../../stores/projectTree';

export function scopeOf(projectId: string): string[] {
  if (isProtectedProject(projectId)) return [projectId];
  try {
    const projects = require('../../stores/storeRefs').projectStoreRef().getState().projects as Array<{ id: string; parentId?: string; pinVerifier?: string }>;
    // A protected folder around it is not read from either.
    return scopeIds(projects, projectId).filter((id) => id === projectId || !projects.find((p) => p.id === id)?.pinVerifier);
  } catch { return [projectId]; }
}
