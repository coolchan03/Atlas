/**
 * "Check these lines": for each line of a lesson that none of its passages backed, look for support in the rest of the learner's documents (the law
 * and standards first, then the books), and then on the standard-setters' own sites. A line is only called backed when a passage really carries
 * most of its words; otherwise it stays unverified, and when the web could not be reached that is said, not taken for "no support".
 */
import { supportOf } from './citations';
import { chunkPlace } from './sources';
import { isEnabled, isReference } from '../standards/docRoles';
import { isOutlineDocument } from '../cpa/outline';
import { supersededEditions } from '../standards/taxSources';
import { officialPages, type Hit, type Search } from '../standards/lookup';

type VerdictStatus = 'backed' | 'found-online' | 'unverified' | 'offline';
export interface LineVerdict { line: string; status: VerdictStatus; source?: string; where?: string; url?: string }

const BACKED = 0.45;
const FOUND = 0.35;

async function inDocuments(line: string, projectId: string): Promise<LineVerdict | null> {
  try {
    const { ragService } = require('../services/rag');
    const docs: Array<{ name: string; enabled?: number | boolean }> = await ragService.getDocumentsInScope(projectId);
    const old = supersededEditions(docs.filter(isEnabled).map((d) => d.name));
    const usable = (n: string) => !old.has(n) && !isOutlineDocument(n);
    // The law and standards are asked first, then everything else.
    for (const include of [(n: string) => usable(n) && isReference(n), (n: string) => usable(n) && !isReference(n)]) {
      const found = await ragService.searchProject(projectId, line, { topK: 6, include });
      for (const c of (found?.chunks ?? []) as Array<{ name: string; content: string; position?: number }>) {
        const at = chunkPlace(String(c.content), c.position);
        if (supportOf(line, at.text) >= BACKED) return { line, status: 'backed', source: c.name, where: at.where };
      }
    }
  } catch { /* the documents could not be searched: the web is tried next */ }
  return null;
}

/** The web, limited to the standard-setters' own pages. 'offline' when no search could be made. */
async function onTheWeb(line: string, search: Search): Promise<LineVerdict> {
  try {
    const pages: Hit[] = await officialPages(line, search);
    const hit = pages.find((p) => supportOf(line, `${p.title} ${p.snippet ?? ''}`) >= FOUND);
    return hit ? { line, status: 'found-online', source: hit.title, url: hit.url } : { line, status: 'unverified' };
  } catch { return { line, status: 'offline' }; }
}

export async function verifyLines(lines: string[], opts: { projectId?: string; search?: Search }): Promise<LineVerdict[]> {
  const out: LineVerdict[] = [];
  for (const line of lines) {
    const here = opts.projectId ? await inDocuments(line, opts.projectId) : null;
    // With no web search to use (off-grid mode, or no way to search) that is said as "could not check", not as "no support found".
    out.push(here ?? (opts.search ? await onTheWeb(line, opts.search) : { line, status: 'offline' }));
  }
  return out;
}

/** The web search the app uses for lookups, as a function of a query; null when off-grid mode is on. */
export function appSearch(): Search | null {
  try {
    const { offGridOn } = require('../atlasTools/offGrid');
    if (offGridOn()) return null;
    const { searchWeb } = require('../services/tools/webSearchProviders');
    const { braveSearch } = require('../services/tools/handlers');
    return async (q: string) => (await searchWeb(q, braveSearch)).results.map((r: { title?: string; url?: string; snippet?: string }) => ({ title: r.title ?? '', url: r.url, snippet: r.snippet }));
  } catch { return null; }
}

export const verdictText = (v: LineVerdict): string => {
  switch (v.status) {
    case 'backed': return `Backed by ${v.source}${v.where ? `, ${v.where}` : ''}`;
    case 'found-online': return `Found at ${v.source ?? 'an official site'}`;
    case 'offline': return 'Could not check: no internet, or off-grid mode is on';
    default: return 'Still not verified: treat it as the AI\'s own knowledge';
  }
};
