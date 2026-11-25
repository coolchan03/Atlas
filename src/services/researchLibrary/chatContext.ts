import { librariesForProject } from './installed';
import { findReference, searchLibrary, type LibraryContext } from './operations';
import { evidenceBudget, evidenceInstructions, fitEvidence, formatEvidence } from './context';
import type { Evidence } from './types';
import { subQueries } from '../offlineProjectResearch';
import { setTurnSources, turnSources, type TurnSource } from '../rag/turnSources';
import { useProjectStore } from '../../stores/projectStore';
import logger from '../../utils/logger';

/** A year in the question ("for 2019", "tax year 2021"): the period the answer has to apply to. */
export function periodInQuestion(q: string): number | undefined {
  const m = /\b(1[89]\d{2}|20\d{2})\b/.exec(q);
  return m ? Number(m[1]) : undefined;
}

/** Everything found for a question across the libraries: by reference, by topic, and by narrower searches when the first is thin. */
export async function gatherEvidence(ctxs: LibraryContext[], question: string): Promise<Evidence[]> {
  const period = periodInQuestion(question);
  const seen = new Set<string>();
  const out: Evidence[] = [];
  const add = (items: Evidence[]) => { for (const e of items) { const k = `${e.libraryId}|${e.documentId}|${e.locator ?? ''}`; if (!seen.has(k)) { seen.add(k); out.push(e); } } };
  for (const c of ctxs) {
    for (const ref of c.profile.findReferences(question).slice(0, 4)) add((await findReference(c, ref, { period })).passages);
    add(await searchLibrary(c, question, { period, limit: 8 }));
  }
  if (out.length < 4) for (const q of subQueries(question)) for (const c of ctxs) add(await searchLibrary(c, q, { period, limit: 5 }));
  return out;
}

/**
 * The library excerpts for this turn as prompt text, sized to the model's real context. Added for every model: it does not rely on the
 * model calling a tool. Returns the prompt unchanged when the project has no library or nothing matches.
 */
export async function injectLibraryContext(turn: { projectId: string | undefined; query: string; prompt: string; contextTokens: number }): Promise<string> {
  const { projectId, query, prompt, contextTokens } = turn;
  if (!projectId) return prompt;
  try {
    const project = useProjectStore.getState().getProject(projectId);
    const ctxs = librariesForProject(project?.researchLibraryIds);
    if (!ctxs.length) return prompt;
    const found = await gatherEvidence(ctxs, query);
    const used = fitEvidence(found, evidenceBudget(contextTokens).evidence);
    if (!used.length) return `${prompt}\n\nThe project's research libraries (${ctxs.map((c) => c.manifest.name).join(', ')}) had no passage for this question. Say that nothing was found in them rather than answering from memory as if it were from them.`;
    const intro = ctxs.map((c) => evidenceInstructions(c.manifest.name, c.manifest.guide, c.profile)).filter((v, i, a) => a.indexOf(v) === i).join('\n');
    const sources: TurnSource[] = used.map((e) => ({ title: `${e.reference}${e.locator ? ` ${e.locator}` : ''}`, quote: e.text.replace(/\s+/g, ' ').slice(0, 200), library: { libraryId: e.libraryId, documentId: e.documentId, locator: e.locator, checksum: e.checksum } }));
    setTurnSources([...turnSources(), ...sources]);
    return `${prompt}\n\n${intro}\n\n${formatEvidence(used)}`;
  } catch (e) {
    logger.warn('[ResearchLibrary] context injection failed', e);
    return prompt;
  }
}
