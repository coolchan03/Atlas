/**
 * Talking to what the AI has learned. `askLearned` looks a question up in the claims the learning cycle stored (each with its sources and how far it
 * has been checked) and, when nothing relevant was learned, says so plainly and lists the connected sources that can be checked instead: the project's
 * documents, the offline library and the web. The chat model then uses the matching tool and says where its answer came from. Nothing is made up here.
 */
import { similarity, yearsOf } from './claimText';
import { learningKnowledgeDb } from './knowledgeDb';
import { useLearningStore } from './store';

/** A claim is "about" the question when it shares at least this much with it. */
const RELEVANT = 0.3;
const LABEL: Record<string, string> = { verified: 'checked by you', candidate: 'learned, not yet reviewed', disputed: 'DISPUTED: sources disagree', needs_review: 'needs review' };

interface LearnedHit { id: string; claim: string; status: string; score: number; topic: string; years: number[] }

/**
 * Rules change by year (a tax rule, a limit, a price). A question that names a year prefers the claims for that year and sets aside
 * claims for other years, so last year's figure is not given as this year's; a question with no year keeps every year, each marked.
 */
function yearAdjusted(score: number, asked: number[], claimYears: number[]): number {
  if (!asked.length || !claimYears.length) return score;
  return claimYears.some((y) => asked.includes(y)) ? Math.min(1, score * 1.25) : score * 0.5;
}

/** The topics the learning cycle has studied (every agent's task), without repeats. */
export function learnedTopics(): string[] {
  const topics = Object.values(useLearningStore.getState().config).map((c) => (c?.topic ?? '').trim()).filter(Boolean);
  return [...new Set(topics)];
}

/** The stored claims closest to a question, best first. */
export function relevantClaims(question: string, limit = 6): LearnedHit[] {
  const hits: LearnedHit[] = [];
  const asked = yearsOf(question);
  for (const topic of learnedTopics()) {
    let known: Array<{ id: string; text: string; status: string }> = [];
    try { known = learningKnowledgeDb.knownClaims(topic, 400); } catch { /* nothing stored yet */ }
    for (const k of known) {
      const years = yearsOf(k.text);
      const score = yearAdjusted(similarity(question, k.text), asked, years);
      if (score >= RELEVANT) hits.push({ id: k.id, claim: k.text, status: k.status, score, topic, years });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The sources a chat can check when the learned claims have no answer. */
export async function connectedSources(projectId?: string): Promise<string[]> {
  const out: string[] = [];
  try {
    if (projectId) {
      const docs = require('../services/rag').ragService.getDocumentsByProject?.(projectId) ?? [];
      const count = Array.isArray(docs) ? docs.length : 0;
      if (count) out.push(`the project's ${count} document${count === 1 ? '' : 's'} (use search_knowledge_base)`);
    }
  } catch { /* no project documents */ }
  try {
    const libs = (require('../atlasTools/offlineLibrary').useOfflineLibrary.getState().files as Array<{ enabled: boolean }>).filter((f) => f.enabled).length;
    if (libs) out.push(`the offline library, ${libs} file${libs === 1 ? '' : 's'} (use search_offline_library)`);
  } catch { /* no library */ }
  try { if (!require('../atlasTools/offGridState').offGridOn()) out.push('the web (use web_search, then read_url to open a result)'); } catch { /* unknown */ }
  return out;
}

/** What the learned_knowledge tool returns for a question. */
export async function askLearned(question: string, projectId?: string): Promise<string> {
  const hits = relevantClaims(question);
  if (hits.length) {
    const lines = hits.map((h, i) => {
      let sources = '';
      try { sources = learningKnowledgeDb.getClaimSources(h.id).slice(0, 3).map((s) => `${s.title}${s.locator ? `, ${s.locator}` : ''}`).join('; '); } catch { /* sources unavailable */ }
      return `[${i + 1}] (${LABEL[h.status] ?? h.status}${h.years.length ? `, year ${h.years.join(' and ')}` : ''}) ${h.claim}${sources ? ` (learned from: ${sources})` : ''}`;
    });
    const spread = new Set(hits.flatMap((h) => h.years)).size > 1 ? ' These claims are for different years: say which year each one applies to, and do not give one year\'s figure as another\'s.' : '';
    return `What was learned that bears on this question:\n${lines.join('\n')}${spread}\nThese were learned by reading sources and are not proven unless they say "checked by you". Say they are what was learned, name the source, and if they do not fully answer the question, check the connected sources too.`;
  }
  const sources = await connectedSources(projectId);
  if (!sources.length) return 'Nothing was learned about this yet, and there are no connected sources to check. Say you do not know, and do not guess.';
  return `Nothing was learned about this yet. Check the connected sources, in this order: ${sources.join('; ')}. Say which source your answer came from and quote the passage. If none of them has it, say you could not find it instead of guessing.`;
}
