import { RagSearchResult, ragDatabase } from './database';
import { isProtectedProject, knowledgeSource } from './knowledgeSource';
import { embeddingService } from './embedding';
import { cosineSimilarity } from './vectorMath';
import { rankChunks } from './rankChunks';
import { refScore, sectionRefs } from './sectionRefs';
import { scopeOf } from './scope';
import { lexicalRank } from './lexicalRank';
import logger from '../../utils/logger';

/** Strip HTML-like tags without regex backtracking risk. */
function stripAngleBracketTags(text: string): string {
  let result = '';
  let inTag = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '<') { inTag = true; continue; }
    if (text[i] === '>') { inTag = false; continue; }
    if (!inTag) result += text[i];
  }
  return result;
}

/** How the passages were found: by meaning, by keywords (the embedding model was unavailable), or not at all — with the reason, so an empty index is not mistaken for a search that found nothing. */
type EvidenceKind = 'semantic' | 'lexical' | 'none-indexed' | 'none-matching';

interface SearchResult {
  chunks: RagSearchResult[];
  truncated: boolean;
  evidence?: EvidenceKind;
  /** True when the keyword search had to stop at LEXICAL_POOL passages of a project, so later passages were not looked at. */
  partial?: boolean;
}

/** How many passages the keyword fallback reads per project. */
const LEXICAL_POOL = 20000;

/** Options for a search: how many passages, and which documents to look in (by name). */
interface SearchOptions { topK?: number; include?: (docName: string) => boolean }

/** The stored embeddings of a project, kept in memory until a document is added, removed or switched, so a lesson (many searches in a row) does not read and decode every one each time. Not kept for a protected project, nor for a very large one. */
const embeddingCache = new Map<string, { version: number; stored: ReturnType<typeof ragDatabase.getEmbeddingsByProject> }>();
const MAX_CACHED = 40000;
/** Forgets the kept embeddings (for a test that swaps the database under the service). */
export const resetEmbeddingCache = (): void => embeddingCache.clear();
function embeddingsOf(projectId: string, source: ReturnType<typeof knowledgeSource>) {
  // No version to compare (or a protected project): read fresh every time.
  if (isProtectedProject(projectId) || typeof ragDatabase.version !== 'number') return source.getEmbeddingsByProject(projectId);
  const hit = embeddingCache.get(projectId);
  if (hit && hit.version === ragDatabase.version) return hit.stored;
  const stored = source.getEmbeddingsByProject(projectId);
  if (stored.length <= MAX_CACHED) embeddingCache.set(projectId, { version: ragDatabase.version, stored }); else embeddingCache.delete(projectId);
  return stored;
}

class RetrievalService {
  async search(projectId: string, query: string, options: number | SearchOptions = 5): Promise<SearchResult> {
    const { topK = 5, include } = typeof options === 'number' ? { topK: options } as SearchOptions : options;
    const exact = isProtectedProject(projectId) ? [] : this.exactMatches(projectId, query, { include, topK });
    const found = await this.searchSemantic(projectId, query, { topK, include });
    const semantic = found.chunks;
    // A passage that carries the exact section asked about comes first; the meaning-based results fill the rest.
    const seen = new Set(exact.map((c) => `${c.doc_id}:${c.position}`));
    const chunks = [...exact, ...semantic.filter((c) => !seen.has(`${c.doc_id}:${c.position}`))].slice(0, Math.max(topK, exact.length));
    const evidence: EvidenceKind = chunks.length ? (found.kind === 'lexical' ? 'lexical' : 'semantic') : found.kind === 'none-indexed' ? 'none-indexed' : 'none-matching';
    return { chunks, truncated: false, evidence, ...(found.partial ? { partial: true } : {}) };
  }

  /** Keyword-ranked passages from the project (and its folders): used only when meaning-based search cannot run. */
  private lexical(projectId: string, query: string, { include, topK = 5 }: SearchOptions): { chunks: RagSearchResult[]; kind: 'lexical' | 'none-matching' | 'none-indexed'; partial?: boolean } {
    try {
      const perProject = scopeOf(projectId).map((id) => knowledgeSource(id).getChunksByProject(id, LEXICAL_POOL));
      const partial = perProject.some((rows) => rows.length >= LEXICAL_POOL);
      const pool = perProject.flat().filter((c) => !include || include(c.name));
      if (!pool.length) return { chunks: [], kind: 'none-indexed' };
      const chunks = lexicalRank(query, pool, topK);
      return { chunks, kind: chunks.length ? 'lexical' : 'none-matching', partial };
    } catch (err) {
      logger.error('[Retrieval] Keyword fallback failed', err);
      return { chunks: [], kind: 'none-matching' };
    }
  }

  /** Passages that contain a section, regulation, ASC topic, ASU, ruling or notice the question names, the ones that open with it first. */
  private exactMatches(projectId: string, query: string, { include, topK = 5 }: SearchOptions): RagSearchResult[] {
    const refs = sectionRefs(query);
    if (!refs.length) return [];
    try {
      // Chunks where the reference is a heading ("§ 179.") first, so a section's own text is not crowded out by the many chunks that only mention it.
      const needles = refs.flatMap((r) => r.needles);
      const ids = scopeOf(projectId);
      const headings = ids.flatMap((id) => ragDatabase.findChunksContaining(id, needles.map((n) => `${n}.`), 40));
      const found = [...headings, ...ids.flatMap((id) => ragDatabase.findChunksContaining(id, needles, 60))].filter((c, i, all) => all.findIndex((o) => o.doc_id === c.doc_id && o.position === c.position) === i).filter((c) => !include || include(c.name));
      return found.map((c) => ({ c, s: refScore(c.content, refs) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, Math.min(topK, 4)).map((x) => ({ ...x.c, score: 1 }));
    } catch { return []; }
  }

  private async searchSemantic(projectId: string, query: string, { include, topK = 5 }: SearchOptions): Promise<{ chunks: RagSearchResult[]; kind: EvidenceKind; partial?: boolean }> {
    if (!query.trim()) return { chunks: [], kind: 'none-matching' };

    // The folders around the project are searched with it (the textbooks kept once for every exam inside a folder).
    const stored = scopeOf(projectId).flatMap((id) => embeddingsOf(id, knowledgeSource(id))).filter((e) => !include || include(e.name));
    if (stored.length === 0) {
      // No embeddings yet: rank by the question's words. Passages that share none are not returned as if they matched.
      logger.log('[Retrieval] No embeddings found, using keyword ranking');
      return this.lexical(projectId, query, { include, topK });
    }

    if (!embeddingService.isLoaded()) {
      try {
        await embeddingService.load();
      } catch (err) {
        logger.error('[Retrieval] Failed to load embedding model, using keyword ranking', err);
        return this.lexical(projectId, query, { include, topK });
      }
    }

    let queryVec: number[];
    try {
      queryVec = await embeddingService.embed(query);
    } catch (err) {
      logger.error('[Retrieval] Failed to embed query, using keyword ranking', err);
      return this.lexical(projectId, query, { include, topK });
    }

    const scored = stored.map(entry => ({
      doc_id: entry.doc_id,
      name: entry.name,
      content: entry.content,
      position: entry.position,
      score: cosineSimilarity(queryVec, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    // Take extra candidates, then keep the ones that are about the question and spread them over the documents.
    const ranked = rankChunks(query, scored.slice(0, topK * 3), topK);
    return { chunks: ranked, kind: ranked.length ? 'semantic' : 'none-matching' };
  }

  formatForPrompt(result: SearchResult): string {
    if (result.chunks.length === 0) return '';

    const sections = result.chunks.map((chunk, index) => {
      // Sanitize content to prevent prompt injection from user-uploaded documents
      const safeName = chunk.name.replaceAll(/[<>]/g, '');
      const safeContent = stripAngleBracketTags(chunk.content);
      return `[Source ${index + 1}: ${safeName} (part ${chunk.position + 1})]\n${safeContent}`;
    });

    return `<knowledge_base>\nThe following excerpts are from the user's project knowledge base. Use them to inform your response when relevant, and cite an excerpt you use by its source number in square brackets, like [1].\n\n${sections.join('\n\n---\n\n')}\n</knowledge_base>`;
  }

  estimateCharBudget(contextLengthTokens: number): number {
    // 25% of context window reserved for RAG; ~4 chars per token → simplifies to contextLength
    return Math.max(0, Math.floor(contextLengthTokens));
  }

  async searchWithBudget(params: { projectId: string; query: string; contextLength: number; topK?: number }): Promise<SearchResult> {
    const result = await this.search(params.projectId, params.query, params.topK ?? 5);
    const budget = this.estimateCharBudget(params.contextLength);

    let totalChars = 0;
    const fittingChunks: RagSearchResult[] = [];
    let truncated = false;

    for (const chunk of result.chunks) {
      totalChars += chunk.content.length;
      if (totalChars > budget) {
        truncated = true;
        break;
      }
      fittingChunks.push(chunk);
    }

    return { chunks: fittingChunks, truncated, evidence: result.evidence };
  }
}

export const retrievalService = new RetrievalService();
