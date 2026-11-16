/**
 * Projects inside projects (folders). A project can sit inside another with `parentId`; the folder then lists what is inside it, and what is
 * inside it can use the folder's own documents (the textbooks you keep once, for every exam inside a CPA folder). Pure, so it is tested without a screen.
 */
export interface TreeNode { id: string; parentId?: string }

export const childrenOf = <T extends TreeNode>(projects: T[], id: string): T[] => projects.filter((p) => p.parentId === id);

/** The folders a project is inside, nearest first. Stops at a missing folder or a loop, so bad data cannot hang the app. */
export function ancestorsOf(projects: TreeNode[], id: string): string[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const out: string[] = [];
  let at = byId.get(id)?.parentId;
  while (at && byId.has(at) && !out.includes(at) && at !== id) { out.push(at); at = byId.get(at)?.parentId; }
  return out;
}

/** The project and the folders around it: where its documents are searched. */
export const scopeIds = (projects: TreeNode[], id: string): string[] => [id, ...ancestorsOf(projects, id)];

/** Whether putting `id` inside `parentId` would make a loop (a folder inside itself or inside something it holds). */
export const wouldLoop = (projects: TreeNode[], id: string, parentId: string): boolean => parentId === id || ancestorsOf(projects, parentId).includes(id);

/** Every project inside a folder, at any depth. */
export function descendantsOf<T extends TreeNode>(projects: T[], id: string, seen = new Set<string>()): T[] {
  const out: T[] = [];
  for (const c of childrenOf(projects, id)) { if (seen.has(c.id)) continue; seen.add(c.id); out.push(c, ...descendantsOf(projects, c.id, seen)); }
  return out;
}

export interface Row<T> { project: T; depth: number; folder: boolean; open: boolean }

/**
 * The list a person sees: the projects that are not inside another (a project whose folder is gone counts as top level), and under each
 * folder that is open the projects inside it, indented. `order` sorts each level.
 */
export function listRows<T extends TreeNode>(projects: T[], open: Set<string>, order: (a: T, b: T) => number): Row<T>[] {
  const ids = new Set(projects.map((p) => p.id));
  const out: Row<T>[] = [];
  const walk = (list: T[], depth: number, seen: Set<string>) => {
    for (const project of [...list].sort(order)) {
      if (seen.has(project.id)) continue;
      const kids = childrenOf(projects, project.id);
      const isOpen = open.has(project.id);
      out.push({ project, depth, folder: kids.length > 0, open: isOpen });
      if (kids.length && isOpen) walk(kids, depth + 1, new Set([...seen, project.id]));
    }
  };
  walk(projects.filter((p) => !p.parentId || !ids.has(p.parentId)), 0, new Set());
  return out;
}
