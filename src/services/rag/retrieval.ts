import { RagSearchResult, StoredEmbedding, ragDatabase } from './database';
import { isProtectedProject, knowledgeSource } from './knowledgeSource';
import { embeddingService } from './embedding';
import { cosineScorer } from './vectorMath';
import { rankChunks } from './rankChunks';
import { refScore, sectionRefs } from './sectionRefs';
import { scopeOf } from './scope';
import { lexicalRank } from './lexicalRank';
import { mergeKeywordHits } from './keywordMerge';
import { noteStage } from '../../atlasTools/stageTimes';
import logger from '../../utils/logger';

/** The passage with its first characters dropped when they repeat the end of the passage before it (the overlap between two windows). Kept whole when the overlap is short. */
export function withoutSharedStart(previous: string, current: string): string {
  const max = Math.min(previous.length, current.length, 400);
  for (let n = max; n >= 30; n -= 1) {
    if (previous.endsWith(current.slice(0, n))) return current.slice(n).replace(/^\s+/, '');
  }
  return current;
}

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

/** Passages that match the question's words, from the full-text index; null for a protected project or a build without the index. */
function keywordCandidates(projectId: string, query: string, limit = KEYWORD_CANDIDATES): RagSearchResult[] | null {
  if (isProtectedProject(projectId)) return null;
  return ragDatabase.searchKeywords(projectId, query, limit);
}
const KEYWORD_CANDIDATES = 400;
/** When documents are filtered out afterwards (an exam that excludes some), read more so the allowed ones are not crowded out of the list. */
const KEYWORD_CANDIDATES_FILTERED = 4000;

/** Options for a search: how many passages, and which documents to look in (by name). */
interface SearchOptions { topK?: number; include?: (docName: string) => boolean }

/** The stored embeddings of a project, kept in memory until a document is added, removed or switched, so a lesson (many searches in a row) does not read and decode every one each time. Not kept for a protected project, nor for a very large one. */
type Embedded = Omit<StoredEmbedding, 'embedding'> & { embedding: ArrayLike<number> };
const embeddingCache = new Map<string, { version: number; stored: Embedded[] }>();
const MAX_CACHED = 40000;
/** Forgets the kept embeddings (for a test that swaps the database under the service). */
export const resetEmbeddingCache = (): void => embeddingCache.clear();
function embeddingsOf(projectId: string, source: ReturnType<typeof knowledgeSource>): Embedded[] {
  // No version to compare (or a protected project): read fresh every time.
  if (isProtectedProject(projectId) || typeof ragDatabase.version !== 'number') return source.getEmbeddingsByProject(projectId);
  const hit = embeddingCache.get(projectId);
  if (hit && hit.version === ragDatabase.version) return hit.stored;
  const stored = source.getEmbeddingsByProject(projectId);
  // Kept as 32-bit floats (what is stored on disk): half the memory of a list of numbers, and a faster pass over each vector.
  if (stored.length <= MAX_CACHED) {
    const compact = stored.map((e): Embedded => ({ ...e, embedding: Float32Array.from(e.embedding) }));
    embeddingCache.set(projectId, { version: ragDatabase.version, stored: compact });
    return compact;
  }
  embeddingCache.delete(projectId);
  return stored;
}

class RetrievalService {
  async search(projectId: string, query: string, options: number | SearchOptions = 5): Promise<SearchResult> {
    const began = Date.now();
    try { return await this.searchTimed(projectId, query, options); } finally { noteStage('retrieval', Date.now() - began); }
  }

  private async searchTimed(projectId: string, query: string, options: number | SearchOptions): Promise<SearchResult> {
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
      // The full-text index finds the passages that contain the question's words in the whole project; without it (a protected project, or a
      // build of SQLite without FTS5) the first passages are read and ranked, which can miss later ones (`partial`).
      const perProject = scopeOf(projectId).map((id) => keywordCandidates(id, query, include ? KEYWORD_CANDIDATES_FILTERED : KEYWORD_CANDIDATES) ?? knowledgeSource(id).getChunksByProject(id, LEXICAL_POOL));
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

    const score = cosineScorer(queryVec);
    const scored = stored.map(entry => ({
      doc_id: entry.doc_id,
      name: entry.name,
      content: entry.content,
      position: entry.position,
      score: score(entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    // Take extra candidates, add what only the question's own words find (a section number, a name), then keep the ones that are
    // about the question and spread them over the documents.
    const keyword = scopeOf(projectId).flatMap((id) => keywordCandidates(id, query, include ? KEYWORD_CANDIDATES_FILTERED : topK * 3) ?? []).filter((c) => !include || include(c.name));
    const ranked = rankChunks(query, mergeKeywordHits(scored.slice(0, topK * 3), keyword, topK * 3), topK);
    return { chunks: ranked, kind: ranked.length ? 'semantic' : 'none-matching' };
  }

  formatForPrompt(result: SearchResult): string {
    if (result.chunks.length === 0) return '';

    const sections = result.chunks.map((chunk, index) => {
      // Sanitize content to prevent prompt injection from user-uploaded documents
      const safeName = chunk.name.replaceAll(/[<>]/g, '');
      // Two neighbouring passages of one document share the overlap their windows were cut with: it is sent once, not twice.
      const before = result.chunks.find((c) => c.doc_id === chunk.doc_id && c.position === chunk.position - 1);
      const safeContent = stripAngleBracketTags(before ? withoutSharedStart(before.content, chunk.content) : chunk.content);
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
